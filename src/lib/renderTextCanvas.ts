import { tokenizeSegments, loadAppleEmoji } from './appleEmoji'
import type { TextOverlay } from '../types/editor'

/**
 * Render a TextOverlay to a transparent canvas (full 1080×1920).
 * Text and Apple emoji are drawn inline at the correct position.
 * Returns an HTMLCanvasElement ready to be read as PNG.
 */
export async function renderTextToCanvas(
  text: TextOverlay,
  canvasW = 1080,
  canvasH = 1920,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width  = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  const { fontSize, bold, color } = text
  const x = (text.x / 100) * canvasW
  const y = (text.y / 100) * canvasH

  ctx.font      = `${bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'alphabetic'

  const lineHeight = fontSize * 1.3
  const lines      = text.content.split('\n')
  const totalH     = lines.length * lineHeight

  for (let li = 0; li < lines.length; li++) {
    const lineSegs = tokenizeSegments(lines[li])

    // ── Measure total line width ───────────────────────────────────────────
    let lineW = 0
    const measured: Array<{ type: 'text' | 'emoji'; content: string; w: number }> = []
    for (const seg of lineSegs) {
      if (seg.type === 'emoji') {
        const w = fontSize * 1.15
        measured.push({ type: 'emoji', content: seg.content, w })
        lineW += w
      } else {
        const w = ctx.measureText(seg.content).width
        measured.push({ type: 'text', content: seg.content, w })
        lineW += w
      }
    }

    // Center the line on x
    let cx  = x - lineW / 2
    const cy = y - totalH / 2 + li * lineHeight + lineHeight * 0.72 // baseline align

    // ── Draw each segment ──────────────────────────────────────────────────
    for (const m of measured) {
      if (m.type === 'text') {
        if (m.content === '') continue
        ctx.font          = `${bold ? 'bold ' : ''}${fontSize}px Arial, sans-serif`
        ctx.strokeStyle   = '#000000'
        ctx.lineWidth     = Math.max(2, fontSize * 0.18)
        ctx.lineJoin      = 'round'
        ctx.miterLimit    = 2
        ctx.strokeText(m.content, cx, cy)
        ctx.fillStyle     = color
        ctx.fillText(m.content, cx, cy)
      } else {
        // Emoji: load Apple image and draw
        const emojiSize = fontSize * 1.15
        const ey = cy - emojiSize * 0.82 // align baseline with text

        try {
          const img = await loadAppleEmoji(m.content)
          ctx.drawImage(img, cx, ey, emojiSize, emojiSize)
        } catch {
          // Fallback: draw as system emoji (looks native on macOS, fallback on Windows)
          ctx.font      = `${fontSize}px Arial, sans-serif`
          ctx.fillStyle = color
          ctx.fillText(m.content, cx, cy)
        }
      }
      cx += m.w
    }
  }

  return canvas
}

/** Canvas → PNG Uint8Array for FFmpeg FS */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}
