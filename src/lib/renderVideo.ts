import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Clip, TextOverlay, AudioTrack } from '../types/editor'
import { tokenizeSegments, loadAppleEmoji } from './appleEmoji'

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

// ── Sync text draw (called inside RAF loop — no awaits) ───────────────────────

type Seg = { type: 'text' | 'emoji'; content: string; w: number }
type ParsedText = { text: TextOverlay; lines: Seg[][] }

/** Pre-parse all text overlays into segments + widths (needs a canvas ctx for measureText) */
function parseTexts(texts: TextOverlay[], ctx: CanvasRenderingContext2D): ParsedText[] {
  return texts
    .filter(t => t.content.trim())
    .map(t => {
      ctx.font = `${t.bold ? 'bold ' : ''}${t.fontSize}px Arial, sans-serif`
      const lines = t.content.split('\n').map(line => {
        const segs: Seg[] = []
        for (const seg of tokenizeSegments(line)) {
          const w = seg.type === 'emoji'
            ? t.fontSize * 1.15
            : ctx.measureText(seg.content).width
          segs.push({ type: seg.type, content: seg.content, w })
        }
        return segs
      })
      return { text: t, lines }
    })
}

/** Draw one text overlay onto ctx synchronously using pre-loaded emojiCache */
function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  parsed: ParsedText,
  emojiCache: Map<string, HTMLImageElement>,
  W: number,
  H: number,
) {
  const { text: t, lines } = parsed
  const { fontSize, bold, color } = t
  const x = (t.x / 100) * W
  const y = (t.y / 100) * H
  const lineHeight = fontSize * 1.3
  const totalH = lines.length * lineHeight

  for (let li = 0; li < lines.length; li++) {
    const segs = lines[li]
    const lineW = segs.reduce((s, seg) => s + seg.w, 0)
    let cx = x - lineW / 2
    const cy = y - totalH / 2 + li * lineHeight + lineHeight * 0.72

    for (const seg of segs) {
      if (seg.type === 'text') {
        if (!seg.content) { cx += seg.w; continue }
        ctx.font        = `${bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`
        ctx.strokeStyle = '#000000'
        ctx.lineWidth   = Math.max(2, fontSize * 0.18)
        ctx.lineJoin    = 'round'
        ctx.miterLimit  = 2
        ctx.strokeText(seg.content, cx, cy)
        ctx.fillStyle   = color
        ctx.fillText(seg.content, cx, cy)
      } else {
        const emojiSize = fontSize * 1.15
        const ey = cy - emojiSize * 0.82
        const img = emojiCache.get(seg.content)
        if (img) {
          ctx.drawImage(img, cx, ey, emojiSize, emojiSize)
        } else {
          ctx.font      = `${fontSize}px Arial, sans-serif`
          ctx.fillStyle = color
          ctx.fillText(seg.content, cx, cy)
        }
      }
      cx += seg.w
    }
  }
}

// ── Phase 1: real-time canvas recording ───────────────────────────────────────

async function captureToWebm(
  clips: Clip[],
  texts: TextOverlay[],
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  const W = 1080, H = 1920
  const totalDur = clips.reduce((s, c) => s + c.duration, 0)

  // Canvas (used for measuring AND recording)
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)

  // Pre-parse text overlays (synchronous — just measures text widths)
  const parsedTexts = parseTexts(texts, ctx)

  // Collect all unique emoji across all text overlays
  onProgress({ step: 'Preparando…', pct: 3 })
  const allEmoji = new Set<string>()
  for (const { lines } of parsedTexts) {
    for (const line of lines) {
      for (const seg of line) {
        if (seg.type === 'emoji') allEmoji.add(seg.content)
      }
    }
  }

  // Pre-load all emoji in parallel (4s timeout each via loadAppleEmoji)
  const emojiCache = new Map<string, HTMLImageElement>()
  if (allEmoji.size > 0) {
    await Promise.all([...allEmoji].map(e =>
      loadAppleEmoji(e)
        .then(img => emojiCache.set(e, img))
        .catch(() => { /* fallback: draw as text */ })
    ))
  }

  onProgress({ step: 'Iniciando grabación…', pct: 5 })

  // Web Audio API: route video element audio into the MediaRecorder stream
  const audioCtx  = new AudioContext({ sampleRate: 44100 })
  // Resume in case AudioContext is suspended after async emoji loading
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})
  const audioDest = audioCtx.createMediaStreamDestination()

  const vidEl = document.createElement('video')
  vidEl.playsInline = true
  vidEl.muted = false
  vidEl.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:-9999px;width:1px;height:1px'
  document.body.appendChild(vidEl)

  let clipGain: GainNode | null = null
  try {
    const vidSrc = audioCtx.createMediaElementSource(vidEl)
    clipGain = audioCtx.createGain()
    vidSrc.connect(clipGain)
    clipGain.connect(audioDest)
  } catch {
    // Audio routing failed — record video only (silent)
  }

  // MediaRecorder
  const mimeType = pickMimeType()
  const videoTracks = canvas.captureStream(30).getVideoTracks()
  const audioTracks = clipGain ? audioDest.stream.getAudioTracks() : []
  const recStream = new MediaStream([...videoTracks, ...audioTracks])
  const recorder = new MediaRecorder(recStream, {
    mimeType,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 192_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
  recorder.start(100)

  // Record each clip sequentially
  let timeline = 0
  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci]
    if (clipGain) clipGain.gain.value = clip.muted ? 0 : clip.volume

    // Load & seek — wait for loadedmetadata before seeking
    await new Promise<void>((res, rej) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return; settled = true
        vidEl.onseeked = null; vidEl.onerror = null; vidEl.onloadedmetadata = null
        clearTimeout(safetyTimer)
        fn()
      }
      // Safety net: never hang more than 15s per clip
      const safetyTimer = setTimeout(() => settle(res), 15_000)

      vidEl.onerror = () => settle(() => rej(new Error(`Error al cargar: ${clip.name}`)))

      const doSeek = () => {
        if (clip.trimStart <= 0) {
          settle(res)
        } else {
          vidEl.onseeked = () => settle(res)
          vidEl.currentTime = clip.trimStart
        }
      }

      if (vidEl.src !== clip.localUrl) {
        vidEl.onloadedmetadata = doSeek
        vidEl.src = clip.localUrl
        vidEl.load()
      } else if (vidEl.readyState >= 1) {
        doSeek()
      } else {
        vidEl.onloadedmetadata = doSeek
      }
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

        // Draw active text overlays synchronously
        const now = timeline + elapsed
        for (const parsed of parsedTexts) {
          const t = parsed.text
          if (now >= t.startAt && now < t.startAt + t.duration) {
            drawTextOverlay(ctx, parsed, emojiCache, W, H)
          }
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
  const webm = await captureToWebm(clips, texts, onProgress)

  onProgress({ step: 'Cargando FFmpeg…', pct: 87 })
  const ffmpeg = await buildFFmpeg()

  const result = await remuxToMp4(ffmpeg, webm, audio, onProgress)
  onProgress({ step: '¡Listo!', pct: 100 })
  return result
}
