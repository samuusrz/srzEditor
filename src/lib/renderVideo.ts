import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Clip, TextOverlay, AudioTrack } from '../types/editor'
import { tokenizeSegments, loadAppleEmoji } from './appleEmoji'

export type RenderProgress = { step: string; pct: number }

const CANVAS_H = 1920
const CANVAS_W = 1080

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

// ── Text drawing (sync, called inside RAF loop) ────────────────────────────────

type Seg = { type: 'text' | 'emoji'; content: string; w: number }
type ParsedText = { text: TextOverlay; lines: Seg[][]; scaledFontSize: number }

/** Pre-parse text overlays. fontSize values are already in canvas pixels. */
function parseTexts(
  texts: TextOverlay[],
  ctx: CanvasRenderingContext2D,
): ParsedText[] {
  return texts
    .filter(t => t.content.trim())
    .map(t => {
      const scaledFontSize = t.fontSize
      ctx.font = `${t.bold ? '700' : '500'} ${scaledFontSize}px "TikTok Sans", Arial, sans-serif`
      const lines = t.content.split('\n').map(line => {
        const segs: Seg[] = []
        for (const seg of tokenizeSegments(line)) {
          const w = seg.type === 'emoji'
            ? scaledFontSize * 1.15
            : ctx.measureText(seg.content).width
          segs.push({ type: seg.type, content: seg.content, w })
        }
        return segs
      })
      return { text: t, lines, scaledFontSize }
    })
}

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  parsed: ParsedText,
  emojiCache: Map<string, HTMLImageElement>,
) {
  const { text: t, lines, scaledFontSize } = parsed
  const x = (t.x / 100) * CANVAS_W
  const y = (t.y / 100) * CANVAS_H
  const lineHeight = scaledFontSize * 1.3
  const totalH = lines.length * lineHeight

  for (let li = 0; li < lines.length; li++) {
    const segs = lines[li]
    const lineW = segs.reduce((s, seg) => s + seg.w, 0)
    let cx = x - lineW / 2
    const cy = y - totalH / 2 + li * lineHeight + lineHeight * 0.72

    for (const seg of segs) {
      if (seg.type === 'text') {
        if (!seg.content) { cx += seg.w; continue }
        ctx.font        = `${t.bold ? '700' : '500'} ${scaledFontSize}px "TikTok Sans", Arial, sans-serif`
        ctx.strokeStyle = '#000000'
        ctx.lineWidth   = Math.max(2, scaledFontSize * 0.12)
        ctx.lineJoin    = 'round'
        ctx.miterLimit  = 2
        ctx.strokeText(seg.content, cx, cy)
        ctx.fillStyle   = t.color
        ctx.fillText(seg.content, cx, cy)
      } else {
        const emojiSize = scaledFontSize * 1.15
        const ey = cy - emojiSize * 0.82
        const img = emojiCache.get(seg.content)
        if (img) {
          ctx.drawImage(img, cx, ey, emojiSize, emojiSize)
        } else {
          ctx.font      = `500 ${scaledFontSize}px "TikTok Sans", Arial, sans-serif`
          ctx.fillStyle = t.color
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
  // Sort clips by their position on the timeline
  const sortedClips = [...clips].sort((a, b) => a.startAt - b.startAt)
  // Total duration = end of last clip
  const totalDur = sortedClips.reduce((max, c) => Math.max(max, c.startAt + c.duration), 0)

  // Canvas
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W; canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d', { alpha: false })!
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  // Pre-load TikTok Sans so canvas uses it (not Arial fallback)
  await Promise.all([
    document.fonts.load(`500 80px "TikTok Sans"`),
    document.fonts.load(`700 80px "TikTok Sans"`),
  ]).catch(() => {})

  // Pre-parse text overlays (synchronous — measures text widths)
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
  const emojiCache = new Map<string, HTMLImageElement>()
  if (allEmoji.size > 0) {
    await Promise.all([...allEmoji].map(e =>
      loadAppleEmoji(e)
        .then(img => emojiCache.set(e, img))
        .catch(() => {})
    ))
  }

  onProgress({ step: 'Iniciando grabación…', pct: 5 })

  // Web Audio API
  const audioCtx  = new AudioContext({ sampleRate: 44100 })
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
  } catch { /* silent fallback */ }

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

  // Helper: draw text overlays for a given timeline position
  const drawTexts = (timelinePos: number) => {
    for (const parsed of parsedTexts) {
      const t = parsed.text
      if (timelinePos >= t.startAt && timelinePos < t.startAt + t.duration) {
        drawTextOverlay(ctx, parsed, emojiCache)
      }
    }
  }

  // Helper: record black frames for a gap on the timeline
  const recordGap = (gapStart: number, gapDur: number) =>
    new Promise<void>(resolve => {
      const wallStart = performance.now()
      const frame = () => {
        const elapsed = (performance.now() - wallStart) / 1000
        if (elapsed >= gapDur) { resolve(); return }
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
        drawTexts(gapStart + elapsed)
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })

  // Record each clip in timeline order, inserting black frames for gaps
  let timelinePos = 0

  for (let ci = 0; ci < sortedClips.length; ci++) {
    const clip = sortedClips[ci]

    // Gap before this clip
    const gapDur = clip.startAt - timelinePos
    if (gapDur > 0.02) {
      await recordGap(timelinePos, gapDur)
      timelinePos = clip.startAt
    }

    // Set clip volume
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
      const safetyTimer = setTimeout(() => settle(res), 15_000)
      vidEl.onerror = () => settle(() => rej(new Error(`Error al cargar: ${clip.name}`)))

      const doSeek = () => {
        if (clip.trimStart <= 0) { settle(res) }
        else { vidEl.onseeked = () => settle(res); vidEl.currentTime = clip.trimStart }
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
    await new Promise<void>(resolve => {
      const wallStart = performance.now()
      const frame = () => {
        const elapsed = (performance.now() - wallStart) / 1000
        if (elapsed >= clip.duration) {
          vidEl.pause()
          timelinePos = clip.startAt + clip.duration
          onProgress({
            step: `Procesando clip ${ci + 1}/${sortedClips.length}…`,
            pct: 8 + Math.round((timelinePos / totalDur) * 74),
          })
          resolve(); return
        }

        // Draw video frame with letterbox
        if (vidEl.readyState >= 2 && vidEl.videoWidth) {
          const s  = Math.min(CANVAS_W / vidEl.videoWidth, CANVAS_H / vidEl.videoHeight)
          const sw = vidEl.videoWidth * s, sh = vidEl.videoHeight * s
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
          ctx.drawImage(vidEl, (CANVAS_W - sw) / 2, (CANVAS_H - sh) / 2, sw, sh)
        }

        drawTexts(clip.startAt + elapsed)
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
  return new Promise<Blob>(resolve => {
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

// ── Main export ────────────────────────────────────────────────────────────────

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
