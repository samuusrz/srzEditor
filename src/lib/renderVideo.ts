import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Clip, TextOverlay, AudioTrack } from '../types/editor'
import { renderTextToCanvas } from './renderTextCanvas'

export type RenderProgress = { step: string; pct: number }

// ── Utils ──────────────────────────────────────────────────────────────────────

function pickMimeType(): string {
  for (const t of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  throw new Error('Tu navegador no soporta grabación de vídeo. Usa Chrome o Firefox.')
}

async function buildFFmpeg(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg()
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  return ffmpeg
}

// ── Phase 1: real-time canvas recording ───────────────────────────────────────
// Records everything (video frames + text overlays + clip audio) in real-time.
// Text overlays are rendered via canvas so Apple emoji always look correct.

async function captureToWebm(
  clips: Clip[],
  texts: TextOverlay[],
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  const W = 1080, H = 1920
  const totalDur = clips.reduce((s, c) => s + c.duration, 0)

  // Pre-render text overlays to canvas images (handles Apple emoji via CDN images)
  onProgress({ step: 'Preparando textos…', pct: 3 })
  const textEntries = await Promise.all(
    texts
      .filter(t => t.content.trim())
      .map(async (t) => ({ tc: await renderTextToCanvas(t, W, H), text: t }))
  )

  // Canvas
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)

  // Web Audio API: route video element audio into the MediaRecorder stream
  const audioCtx  = new AudioContext({ sampleRate: 44100 })
  const audioDest = audioCtx.createMediaStreamDestination()

  const vidEl = document.createElement('video')
  vidEl.playsInline = true
  // Hidden in DOM — needed by some browsers for audio capture
  vidEl.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:-9999px;width:1px;height:1px'
  document.body.appendChild(vidEl)

  const vidSrc   = audioCtx.createMediaElementSource(vidEl)
  const clipGain = audioCtx.createGain()
  vidSrc.connect(clipGain)
  clipGain.connect(audioDest)

  // MediaRecorder
  const mimeType = pickMimeType()
  const recStream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ])
  const recorder = new MediaRecorder(recStream, {
    mimeType,
    videoBitsPerSecond: 10_000_000, // 10 Mbps for crisp 1080×1920
    audioBitsPerSecond: 192_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
  recorder.start(100)

  // Record each clip sequentially
  let timeline = 0
  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci]
    clipGain.gain.value = clip.muted ? 0 : clip.volume

    // Load & seek
    await new Promise<void>((res, rej) => {
      const done = (fn: () => void) => { vidEl.onseeked = null; vidEl.onerror = null; fn() }
      vidEl.onseeked = () => done(res)
      vidEl.onerror  = () => done(() => rej(new Error(`Error al cargar: ${clip.name}`)))
      if (vidEl.src !== clip.localUrl) { vidEl.src = clip.localUrl; vidEl.load() }
      vidEl.currentTime = clip.trimStart
    })

    // Capture frames for clip.duration seconds
    await new Promise<void>((resolve) => {
      const wallStart = performance.now()

      const frame = () => {
        const elapsed = (performance.now() - wallStart) / 1000
        if (elapsed >= clip.duration) {
          vidEl.pause()
          timeline += clip.duration
          onProgress({
            step: `Grabando clip ${ci + 1}/${clips.length}…`,
            pct: 8 + Math.round((timeline / totalDur) * 74),
          })
          resolve(); return
        }

        // Draw video frame with letterbox
        if (vidEl.readyState >= 2 && vidEl.videoWidth) {
          const s  = Math.min(W / vidEl.videoWidth, H / vidEl.videoHeight)
          const sw = vidEl.videoWidth * s, sh = vidEl.videoHeight * s
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
          ctx.drawImage(vidEl, (W - sw) / 2, (H - sh) / 2, sw, sh)
        }

        // Composite active text overlays
        const now = timeline + elapsed
        for (const { tc, text: t } of textEntries) {
          if (now >= t.startAt && now < t.startAt + t.duration) ctx.drawImage(tc, 0, 0)
        }

        requestAnimationFrame(frame)
      }

      vidEl.play()
        .then(() => requestAnimationFrame(frame))
        .catch(() => requestAnimationFrame(frame))
    })
  }

  document.body.removeChild(vidEl)
  await audioCtx.close()

  onProgress({ step: 'Guardando grabación…', pct: 84 })
  return new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
    recorder.stop()
  })
}

// ── Phase 2: fast remux to MP4 (no video re-encode) ───────────────────────────
// FFmpeg only does: container conversion WebM→MP4 + optional audio mixing.
// -c:v copy means the VP9 video stream is passed through unchanged → seconds, not minutes.

async function remuxToMp4(
  ffmpeg: FFmpeg,
  webm: Blob,
  audio: AudioTrack | null,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  onProgress({ step: 'Generando MP4…', pct: 90 })
  await ffmpeg.writeFile('input.webm', new Uint8Array(await webm.arrayBuffer()))

  const cmd: string[] = ['-i', 'input.webm']

  if (audio) {
    await ffmpeg.writeFile('ext_audio', await fetchFile(audio.file))
    cmd.push('-i', 'ext_audio')

    // Delay external audio to its startAt position, then apply fade
    const delayMs = Math.round(audio.startAt * 1000)
    const af: string[] = ['aresample=44100']
    if (delayMs > 0) af.push(`adelay=${delayMs}|${delayMs}`)
    if (audio.fadeIn  > 0) af.push(`afade=t=in:st=${audio.startAt.toFixed(3)}:d=${audio.fadeIn.toFixed(3)}`)
    if (audio.fadeOut > 0) {
      const st = (audio.startAt + audio.duration - audio.fadeOut).toFixed(3)
      af.push(`afade=t=out:st=${st}:d=${audio.fadeOut.toFixed(3)}`)
    }

    cmd.push(
      '-filter_complex',
        `[0:a:0]aresample=44100[ca];[1:a:0]${af.join(',')}[ea];[ca][ea]amix=inputs=2:duration=first:normalize=0[aout]`,
      '-map', '0:v:0', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    )
  } else {
    // No external audio — just copy everything
    cmd.push('-c', 'copy')
  }

  cmd.push('-movflags', '+faststart', 'output.mp4')

  let lastPct = 90
  const handler = ({ progress }: { progress: number }) => {
    const p = Math.min(1, Math.max(0, progress))
    lastPct = 90 + Math.round(p * 8)
    onProgress({ step: 'Generando MP4…', pct: lastPct })
    if (p >= 0.98) ffmpeg.off('progress', handler)
  }
  ffmpeg.on('progress', handler)

  const code = await ffmpeg.exec(cmd)
  ffmpeg.off('progress', handler)
  if (code !== 0) throw new Error(`Error al generar MP4 (código ${code}).`)

  const data = await ffmpeg.readFile('output.mp4')
  return new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' })
}

// ── Main export function ───────────────────────────────────────────────────────

export async function renderVideoInBrowser(
  clips:  Clip[],
  texts:  TextOverlay[],
  audio:  AudioTrack | null,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  // Phase 1 — real-time canvas recording (~same duration as the video)
  const webm = await captureToWebm(clips, texts, onProgress)

  // Phase 2 — load FFmpeg + remux (fast: no video re-encode)
  onProgress({ step: 'Cargando FFmpeg…', pct: 87 })
  const ffmpeg = await buildFFmpeg()

  const result = await remuxToMp4(ffmpeg, webm, audio, onProgress)
  onProgress({ step: '¡Listo!', pct: 100 })
  return result
}
