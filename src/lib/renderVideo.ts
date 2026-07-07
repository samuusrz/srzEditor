import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Clip, TextOverlay, AudioTrack } from '../types/editor'
import { renderTextToCanvas, canvasToPng } from './renderTextCanvas'

export type RenderProgress = { step: string; pct: number }

// ── Helpers ────────────────────────────────────────────────────────────────────

const VF = [
  'scale=1080:1920:force_original_aspect_ratio=decrease',
  'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
  'setsar=1',
  'fps=30',
].join(',')

async function loadFFmpeg(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg()
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  return ffmpeg
}

// ── Filter builder ─────────────────────────────────────────────────────────────

type TextPng = { name: string; text: TextOverlay; data: Uint8Array }

function buildCommand(
  clips: Clip[],
  textPngs: TextPng[],
  audio: AudioTrack | null,
  withClipAudio: boolean,
): string[] {
  const cmd: string[] = []
  let idx = 0
  const filterParts: string[] = []

  // ── Inputs: clips (with fast trim via -ss/-t before -i) ───────────────────
  const clipBase = idx
  for (let i = 0; i < clips.length; i++) {
    cmd.push('-ss', clips[i].trimStart.toFixed(3), '-t', clips[i].duration.toFixed(3), '-i', `clip${i}`)
    idx++
  }

  // ── Inputs: text PNGs (loop still image) ──────────────────────────────────
  const textBase = idx
  for (let i = 0; i < textPngs.length; i++) {
    cmd.push('-loop', '1', '-i', textPngs[i].name)
    idx++
  }

  // ── Input: external audio ─────────────────────────────────────────────────
  const audioIdx = audio ? idx++ : -1
  if (audio) cmd.push('-i', 'audio_input')

  // ── Per-clip scale ─────────────────────────────────────────────────────────
  for (let i = 0; i < clips.length; i++) {
    filterParts.push(`[${clipBase + i}:v:0]${VF}[v${i}n]`)
  }

  // ── Concat ─────────────────────────────────────────────────────────────────
  if (withClipAudio) {
    const inputs = clips.map((_, i) => `[v${i}n][${clipBase + i}:a:0]`).join('')
    filterParts.push(`${inputs}concat=n=${clips.length}:v=1:a=1[cv][ca]`)
  } else {
    // Clips have no audio — concatenate video only, add silence
    const inputs = clips.map((_, i) => `[v${i}n]`).join('')
    filterParts.push(`${inputs}concat=n=${clips.length}:v=1:a=0[cv]`)
    const totalDur = clips.reduce((s, c) => s + c.duration, 0).toFixed(3)
    filterParts.push(`aevalsrc=0:c=stereo:s=44100:d=${totalDur}[ca]`)
  }

  // ── Text PNG overlays ──────────────────────────────────────────────────────
  let curV = '[cv]'
  for (let i = 0; i < textPngs.length; i++) {
    const { text: t } = textPngs[i]
    const tag = i < textPngs.length - 1 ? `[vt${i}]` : '[vout]'
    filterParts.push(
      `${curV}[${textBase + i}:v:0]overlay=enable='between(t,${t.startAt.toFixed(3)},${(t.startAt + t.duration).toFixed(3)})':x=0:y=0${tag}`,
    )
    curV = tag
  }

  // ── External audio mix ─────────────────────────────────────────────────────
  let finalA = '[ca]'
  if (audio && audioIdx >= 0) {
    const af: string[] = ['aresample=44100']
    if (audio.fadeIn  > 0) af.push(`afade=t=in:st=0:d=${audio.fadeIn.toFixed(3)}`)
    if (audio.fadeOut > 0) af.push(`afade=t=out:st=${Math.max(0, audio.duration - audio.fadeOut).toFixed(3)}:d=${audio.fadeOut.toFixed(3)}`)
    filterParts.push(`[${audioIdx}:a:0]${af.join(',')}[ext_a]`)
    filterParts.push(`[ca][ext_a]amix=inputs=2:duration=first:normalize=0[aout]`)
    finalA = '[aout]'
  }

  const finalV = textPngs.length > 0 ? '[vout]' : '[cv]'

  cmd.push(
    '-filter_complex', filterParts.join(';'),
    '-map', finalV,
    '-map', finalA,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    'output.mp4',
  )
  return cmd
}

// ── Exec with progress animation ───────────────────────────────────────────────

async function execWithProgress(
  ffmpeg: FFmpeg,
  cmd: string[],
  onProgress: (p: RenderProgress) => void,
): Promise<number> {
  let lastPct = 26
  let animTimer: ReturnType<typeof setInterval> | null = null

  const handler = ({ progress }: { progress: number }) => {
    const p = Math.min(1, Math.max(0, progress))
    lastPct = 26 + Math.round(p * 64)  // 26% → 90%
    onProgress({ step: `Codificando… ${Math.round(p * 100)}%`, pct: lastPct })

    // When FFmpeg finishes encoding (p≈1), it enters a silent mux phase.
    // Start a slow animation so the bar doesn't appear frozen.
    if (p >= 0.98 && !animTimer) {
      animTimer = setInterval(() => {
        if (lastPct < 95) { lastPct++; onProgress({ step: 'Generando archivo…', pct: lastPct }) }
      }, 2500)
    }
  }

  ffmpeg.on('progress', handler)
  try {
    return await ffmpeg.exec(cmd)
  } finally {
    if (animTimer) clearInterval(animTimer)
    ffmpeg.off('progress', handler)
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function renderVideoInBrowser(
  clips:  Clip[],
  texts:  TextOverlay[],
  audio:  AudioTrack | null,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {

  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error('SharedArrayBuffer no disponible. Asegúrate de que el sitio tiene los headers COOP/COEP.')
  }

  // ── 0. Render texts to PNG via canvas (handles Apple emoji) ───────────────
  onProgress({ step: 'Preparando textos…', pct: 2 })
  const activeTexts = texts.filter(t => t.content.trim())
  const textPngs: TextPng[] = []
  for (let i = 0; i < activeTexts.length; i++) {
    const canvas = await renderTextToCanvas(activeTexts[i], 1080, 1920)
    textPngs.push({ name: `tov${i}.png`, text: activeTexts[i], data: await canvasToPng(canvas) })
    onProgress({ step: `Preparando texto ${i + 1}/${activeTexts.length}…`, pct: 2 + Math.round((i + 1) / activeTexts.length * 5) })
  }

  // ── 1. Load FFmpeg ─────────────────────────────────────────────────────────
  onProgress({ step: 'Cargando FFmpeg…', pct: 8 })
  const ffmpeg = await loadFFmpeg()

  // ── 2. Write all files to FS ───────────────────────────────────────────────
  onProgress({ step: 'Cargando clips…', pct: 13 })
  for (let i = 0; i < clips.length; i++) {
    await ffmpeg.writeFile(`clip${i}`, await fetchFile(clips[i].file))
    onProgress({ step: `Cargando clip ${i + 1}/${clips.length}…`, pct: 13 + Math.round((i + 1) / clips.length * 12) })
  }
  for (const tp of textPngs) await ffmpeg.writeFile(tp.name, tp.data)
  if (audio) await ffmpeg.writeFile('audio_input', await fetchFile(audio.file))

  // ── 3. Single-pass encode (all clips + texts + audio in one FFmpeg call) ───
  onProgress({ step: 'Iniciando render…', pct: 26 })

  const cmd = buildCommand(clips, textPngs, audio, true)
  let code  = await execWithProgress(ffmpeg, cmd, onProgress)

  if (code !== 0) {
    // Retry without clip audio (clip has no audio track)
    try { await ffmpeg.deleteFile('output.mp4') } catch { /* ignore */ }
    onProgress({ step: 'Reintentando (clips sin audio)…', pct: 26 })
    const cmd2 = buildCommand(clips, textPngs, audio, false)
    code = await execWithProgress(ffmpeg, cmd2, onProgress)
    if (code !== 0) throw new Error(`FFmpeg falló (código ${code}). Formato de vídeo incompatible.`)
  }

  // ── 4. Read result ─────────────────────────────────────────────────────────
  onProgress({ step: 'Finalizando…', pct: 97 })
  const data = await ffmpeg.readFile('output.mp4')
  return new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' })
}
