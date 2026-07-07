// ── Apple Emoji utilities ──────────────────────────────────────────────────────

const CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64'

/** All Unicode codepoints in the emoji string (hex strings) */
function codepoints(emoji: string): string[] {
  const pts: string[] = []
  let i = 0
  while (i < emoji.length) {
    const cp = emoji.codePointAt(i)!
    pts.push(cp.toString(16))
    i += cp > 0xFFFF ? 2 : 1
  }
  return pts
}

/**
 * Convert an emoji grapheme cluster to its Apple CDN image URL.
 * Returns two candidate URLs: with FE0F and without FE0F.
 * One of them is guaranteed to exist for any standard emoji.
 */
export function appleEmojiUrls(emoji: string): [string, string] {
  const pts = codepoints(emoji)
  const withoutFe0f = pts.filter(p => p !== 'fe0f')

  // Ensure FE0F is present (some editors strip it from source code)
  // Try with FE0F first (that's what emoji-datasource-apple usually uses)
  const hasFe0f = pts.includes('fe0f')
  const primaryPts = hasFe0f ? pts : insertFe0f(pts)

  const primary   = `${CDN}/${primaryPts.join('-')}.png`
  const secondary = `${CDN}/${(hasFe0f ? withoutFe0f : pts).join('-')}.png`

  return [primary, secondary]
}

/** Primary URL candidate (used as src) */
export function appleEmojiUrl(emoji: string): string {
  return appleEmojiUrls(emoji)[0]
}

/** Insert FE0F after the first codepoint if it's a text-default emoji that needs it */
function insertFe0f(pts: string[]): string[] {
  if (pts.length === 0) return pts
  // Single-codepoint emoji that use FE0F for emoji presentation
  const needsFe0f = parseInt(pts[0], 16)
  const TEXT_DEFAULT = [
    0x0023, 0x002A, 0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035,
    0x0036, 0x0037, 0x0038, 0x0039, // digits #*0-9
    0x00A9, 0x00AE, // © ®
    0x203C, 0x2049, 0x2122, 0x2139,
    0x2194, 0x2195, 0x2196, 0x2197, 0x2198, 0x2199,
    0x21A9, 0x21AA,
    0x231A, 0x231B, 0x2328, 0x23CF, 0x23E9, 0x23EA, 0x23EB, 0x23EC, 0x23ED, 0x23EE, 0x23EF, 0x23F0, 0x23F1, 0x23F2, 0x23F3,
    0x23F8, 0x23F9, 0x23FA,
    0x24C2, 0x25AA, 0x25AB, 0x25B6, 0x25C0, 0x25FB, 0x25FC, 0x25FD, 0x25FE,
    0x2600, 0x2601, 0x2602, 0x2603, 0x2604, 0x260E, 0x2611, 0x2614, 0x2615,
    0x2618, 0x261D, 0x2620, 0x2622, 0x2623, 0x2626, 0x262A, 0x262E, 0x262F,
    0x2638, 0x2639, 0x263A, 0x2640, 0x2642, 0x2648, 0x2649, 0x264A, 0x264B, 0x264C, 0x264D, 0x264E, 0x264F, 0x2650, 0x2651, 0x2652, 0x2653,
    0x265F, 0x2660, 0x2663, 0x2665, 0x2666, 0x2668, 0x267B, 0x267E, 0x267F,
    0x2692, 0x2693, 0x2694, 0x2695, 0x2696, 0x2697, 0x2699, 0x269B, 0x269C,
    0x26A0, 0x26A1, 0x26A7, 0x26AA, 0x26AB, 0x26B0, 0x26B1, 0x26BD, 0x26BE,
    0x26C4, 0x26C5, 0x26CE, 0x26CF, 0x26D1, 0x26D3, 0x26D4,
    0x26E9, 0x26EA, 0x26F0, 0x26F1, 0x26F2, 0x26F3, 0x26F4, 0x26F5,
    0x26F7, 0x26F8, 0x26F9, 0x26FA, 0x26FD,
    0x2702, 0x2705, 0x2708, 0x2709, 0x270A, 0x270B, 0x270C, 0x270D, 0x270F,
    0x2712, 0x2714, 0x2716, 0x271D, 0x2721, 0x2728,
    0x2733, 0x2734, 0x2744, 0x2747, 0x274C, 0x274E,
    0x2753, 0x2754, 0x2755, 0x2757,
    0x2763, 0x2764, // ❤
    0x2795, 0x2796, 0x2797, 0x27A1, 0x27B0, 0x27BF,
    0x2934, 0x2935,
    0x2B05, 0x2B06, 0x2B07, 0x2B1B, 0x2B1C, 0x2B50, 0x2B55,
    0x3030, 0x303D, 0x3297, 0x3299,
  ]
  if (TEXT_DEFAULT.includes(needsFe0f)) {
    // Insert FE0F after first codepoint
    return [pts[0], 'fe0f', ...pts.slice(1)]
  }
  return pts
}

/** Returns true if the grapheme cluster is a visual emoji */
export function isEmojiCluster(grapheme: string): boolean {
  const cp = grapheme.codePointAt(0) ?? 0
  if (cp < 0x200) return false   // ASCII / basic latin
  if (cp === 0xFE0F) return false // standalone variation selector
  if (cp === 0x200D) return false // standalone ZWJ
  if (cp >= 0x1F3FB && cp <= 0x1F3FF) return false // standalone skin tone modifier
  return /^\p{Extended_Pictographic}/u.test(grapheme)
}

export type Segment = { type: 'text'; content: string } | { type: 'emoji'; content: string }

/**
 * Split text into plain-text and emoji segments.
 * Uses Intl.Segmenter (supported in all modern browsers) for correct ZWJ/skin-tone handling.
 */
export function tokenizeSegments(text: string): Segment[] {
  // Intl.Segmenter available in Chrome 87+, Firefox 125+, Safari 14.1+ — fine for WASM users
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
  const graphemes = [...segmenter.segment(text)].map(s => s.segment)

  const segments: Segment[] = []
  let buf = ''
  for (const g of graphemes) {
    if (isEmojiCluster(g)) {
      if (buf) { segments.push({ type: 'text', content: buf }); buf = '' }
      segments.push({ type: 'emoji', content: g })
    } else {
      buf += g
    }
  }
  if (buf) segments.push({ type: 'text', content: buf })
  return segments
}

// ── Image loading (with URL fallback) ─────────────────────────────────────────

const imgCache = new Map<string, HTMLImageElement>()

export function loadAppleEmoji(emoji: string): Promise<HTMLImageElement> {
  const [primary, fallback] = appleEmojiUrls(emoji)
  if (imgCache.has(primary)) return Promise.resolve(imgCache.get(primary)!)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let tried = false
    img.onload  = () => { imgCache.set(primary, img); resolve(img) }
    img.onerror = () => {
      if (!tried) {
        tried = true
        img.src = fallback
      } else {
        reject(new Error(`Emoji not found: ${emoji}`))
      }
    }
    img.src = primary
  })
}

/**
 * React img onError handler — tries the fallback URL (swap FE0F presence),
 * then gives up (broken image replaced by nothing special).
 */
export function onEmojiImgError(
  e: React.SyntheticEvent<HTMLImageElement>,
  emoji: string,
): void {
  const el = e.target as HTMLImageElement
  if (el.dataset.emojiRetried) return  // already tried fallback — give up, avoid infinite loop
  el.dataset.emojiRetried = '1'
  const [primary, fallback] = appleEmojiUrls(emoji)
  if (fallback !== primary) el.src = fallback
}
