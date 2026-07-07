import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Clip, TextOverlay, AudioTrack } from '../types/editor'
import { renderTextToCanvas, canvasToPng } from './renderTextCanvas'

export type RenderProgress = { step: string; pct: number }

// ── FFmpeg loader ──────────────────────────────────────────────────────────────

async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg()
  if (onLog) ffmpeg.on('log', ({ message }) => onLog(message))

  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  return ffmpeg
}

// ── Clip normalisation ─────────────────────────────────────────────────────────
// Trims clip, scales to 1080×1920 (with letterbox), ensures audio.
// Falls back to a null audio source if the clip has no audio track.

const VF = [
  'scale=1080:1920:force_original_aspect_ratio=decrease',
  'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
  'setsar=1',
  'fps=30',
].join(',')

async function normaliseClip(
  ffmpeg: FFmpeg,
  inputName: string,
  outputName: string,
  trimStart: number,
  duration: number,
): Promise<void> {
  const ss  = trimStart.toFixed(3)
  const dur = duration.toFixed(3)

  // ── Pass 1: video + original audio ───────────────────────────────────────
  const code1 = await ffmpeg.exec([
    '-ss', ss, '-t', dur, '-i', inputName,
    '-vf', VF,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-map', '0:v:0', '-map', '0:a:0',
    outputName,
  ])

  if (code1 === 0) return

  // ── Pass 2: no audio track → add silence ─────────────────────────────────
  try { await ffmpeg.deleteFile(outputName) } catch { /* ignore */ }

  const code2 = await ffmpeg.exec([
    '-ss', ss, '-t', dur, '-i', inputName,
    '-f', 'lavfi', '-t', dur, '-i', `aevalsrc=0:c=stereo:s=44100`,
    '-filter_complex', `[0:v]${VF}[vn]`,
    '-map', '[vn]', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    outputName,
  ])

  if (code2 !== 0) throw new Error(`Failed to process clip "${inputName}". FFmpeg exit ${code2}.`)
}

// ── Main export function ───────────────────────────────────────────────────────

export async function renderVideoInBrowser(
  clips:  Clip[],
  texts:  TextOverlay[],
  audio:  AudioTrack | null,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {

  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'SharedArrayBuffer no disponible. Asegúrate de que el sitio tiene los headers COOP/COEP.',
    )
  }

  // ── 0. Render text overlays to PNG (canvas — Apple emoji support) ──────────
  onProgress({ step: 'Preparando textos…', pct: 2 })
  const activeTexts = texts.filter(t => t.content.trim())
  const textPngs: Array<{ name: string; text: TextOverlay }> = []
  for (let i = 0; i < activeTexts.length; i++) {
    const t      = activeTexts[i]
    const canvas = await renderTextToCanvas(t, 1080, 1920)
    textPngs.push({ name: `tov${i}.png`, text: t })
    // Store the PNG data for writing to FFmpeg FS after it's loaded
    ;(textPngs[i] as any)._pngData = await canvasToPng(canvas)
    onProgress({ step: `Preparando texto ${i + 1}/${activeTexts.length}…`, pct: 2 + Math.round((i + 1) / activeTexts.length * 6) })
  }

  // ── 1. Load FFmpeg ─────────────────────────────────────────────────────────
  onProgress({ step: 'Cargando FFmpeg…', pct: 8 })
  const ffmpeg = await loadFFmpeg()

  // Write text PNGs to FS
  for (const tp of textPngs) {
    await ffmpeg.writeFile(tp.name, (tp as any)._pngData as Uint8Array)
  }

  // ── 2. Write & normalise clips ─────────────────────────────────────────────
  onProgress({ step: 'Cargando clips…', pct: 12 })
  const normNames: string[] = []
  for (let i = 0; i < clips.length; i++) {
    const rawName  = `raw${i}`
    const normName = `norm${i}.mp4`
    await ffmpeg.writeFile(rawName, await fetchFile(clips[i].file))
    onProgress({ step: `Procesando clip ${i + 1}/${clips.length}…`, pct: 12 + Math.round((i + 1) / clips.length * 28) })
    await normaliseClip(ffmpeg, rawName, normName, clips[i].trimStart, clips[i].duration)
    normNames.push(normName)
  }

  // ── 3. Write audio file ────────────────────────────────────────────────────
  let audioName: string | null = null
  if (audio) {
    audioName = 'audio_input'
    await ffmpeg.writeFile(audioName, await fetchFile(audio.file))
  }

  // ── 4. Concatenate clips ───────────────────────────────────────────────────
  onProgress({ step: 'Concatenando…', pct: 42 })

  let concatResult: string

  if (normNames.length === 1) {
    // Only one clip — skip concat
    concatResult = normNames[0]
  } else {
    // Write concat list
    const listLines = normNames.map(n => `file '${n}'`).join('\n')
    await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listLines))

    const concatCode = await ffmpeg.exec([
      '-f', 'concat', '-safe', '0', '-i', 'list.txt',
      '-c', 'copy',
      'concat.mp4',
    ])
    if (concatCode !== 0) throw new Error(`Error al concatenar clips (código ${concatCode}).`)
    concatResult = 'concat.mp4'
  }

  // ── 5. Build composite + audio filter ─────────────────────────────────────
  onProgress({ step: 'Aplicando textos y audio…', pct: 50 })

  const inputs: string[] = ['-i', concatResult]
  // Add text PNG inputs (each is a separate -loop 1 -i input)
  const tImgOffset = 1  // input index for first text PNG (after concatResult = input 0)
  for (const tp of textPngs) {
    inputs.push('-loop', '1', '-i', tp.name)
  }

  // Add external audio input (after text PNGs)
  const audioInputIdx = 1 + textPngs.length

  const filterParts: string[] = []
  let curV = `[0:v:0]`

  // Chain text overlay filters
  for (let i = 0; i < textPngs.length; i++) {
    const { text: t } = textPngs[i]
    const inImg  = `[${tImgOffset + i}:v:0]`
    const outTag = i < textPngs.length - 1 ? `[vt${i}]` : '[voverlay]'
    filterParts.push(
      `${curV}${inImg}overlay=enable='between(t,${t.startAt},${t.startAt + t.duration})':x=0:y=0${outTag}`,
    )
    curV = outTag
  }

  // If no texts, just alias the video stream
  const finalV = textPngs.length > 0 ? '[voverlay]' : '[0:v:0]'

  // Audio chain
  let finalA = '[0:a:0]'
  if (audio && audioName) {
    inputs.push('-i', audioName)

    const fadeFilters: string[] = []
    if (audio.fadeIn  > 0) fadeFilters.push(`afade=t=in:st=0:d=${audio.fadeIn}`)
    if (audio.fadeOut > 0) fadeFilters.push(`afade=t=out:st=${Math.max(0, audio.duration - audio.fadeOut)}:d=${audio.fadeOut}`)

    const fadePart = fadeFilters.length > 0 ? `,${fadeFilters.join(',')}` : ''
    filterParts.push(`[${audioInputIdx}:a:0]aresample=44100${fadePart}[ext_a]`)
    filterParts.push(`[0:a:0][ext_a]amix=inputs=2:duration=first:normalize=0[aout]`)
    finalA = '[aout]'
  }

  const filterComplex = filterParts.join(';')
  const mapV = textPngs.length > 0 ? finalV : '0:v:0'

  // Build final FFmpeg command
  const cmd: string[] = [
    ...inputs,
  ]
  if (filterComplex) {
    cmd.push('-filter_complex', filterComplex)
  }
  cmd.push(
    '-map', mapV,
    '-map', finalA === '[aout]' ? '[aout]' : '0:a:0',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    'output.mp4',
  )

  // Register progress listener only for the final encoding step
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    const p = Math.min(1, Math.max(0, progress))
    onProgress({ step: 'Codificando…', pct: 50 + Math.round(p * 45) })
  }
  ffmpeg.on('progress', onFfmpegProgress)

  let exitCode: number
  try {
    exitCode = await ffmpeg.exec(cmd)
  } finally {
    ffmpeg.off('progress', onFfmpegProgress)
  }

  if (exitCode !== 0) throw new Error(`FFmpeg falló durante la codificación final (código ${exitCode}).`)

  // ── 6. Read result ─────────────────────────────────────────────────────────
  onProgress({ step: 'Finalizando…', pct: 97 })
  const data = await ffmpeg.readFile('output.mp4')
  return new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' })
}
