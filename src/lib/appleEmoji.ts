// ── Apple Emoji utilities ──────────────────────────────────────────────────────

const CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64'

/** Convert an emoji grapheme cluster to its Apple CDN image URL */
export function appleEmojiUrl(emoji: string): string {
  const codepoints: string[] = []
  let i = 0
  while (i < emoji.length) {
    const cp = emoji.codePointAt(i)!
    codepoints.push(cp.toString(16))
    i += cp > 0xFFFF ? 2 : 1
  }
  return `${CDN}/${codepoints.join('-')}.png`
}

/** Returns true if the grapheme cluster is a visual emoji (not #, * or digits) */
export function isEmojiCluster(grapheme: string): boolean {
  const cp = grapheme.codePointAt(0) ?? 0
  if (cp < 0x200) return false // ASCII / basic latin – never emoji images
  return /^\p{Extended_Pictographic}/u.test(grapheme)
}

export type Segment = { type: 'text'; content: string } | { type: 'emoji'; content: string }

/** Split text into plain-text and emoji segments using Intl.Segmenter */
export function tokenizeSegments(text: string): Segment[] {
  const segments: Segment[] = []

  const graphemes: string[] = (() => {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      return [...new (Intl as any).Segmenter('en', { granularity: 'grapheme' }).segment(text)]
        .map((s: any) => s.segment as string)
    }
    // Fallback (not ZWJ-safe but acceptable)
    return [...text]
  })()

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

// ── Image cache ────────────────────────────────────────────────────────────────

const imgCache = new Map<string, HTMLImageElement>()

export function loadAppleEmoji(emoji: string): Promise<HTMLImageElement> {
  const url = appleEmojiUrl(emoji)
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url)!)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { imgCache.set(url, img); resolve(img) }
    img.onerror = () => reject(new Error(`Emoji not found: ${emoji}`))
    img.src = url
  })
}
