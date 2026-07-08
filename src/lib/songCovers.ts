const KEY = 'srz-song-covers'

function getAll(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export function getAllSongCovers(): Record<string, string> {
  return getAll()
}

export function getSongCover(id: string): string | null {
  return getAll()[id] ?? null
}

export function setSongCover(id: string, file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 160; canvas.height = 160
      const ctx = canvas.getContext('2d')!
      const size = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 160, 160)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
      const all = getAll()
      all[id] = dataUrl
      try { localStorage.setItem(KEY, JSON.stringify(all)) } catch {}
      resolve(dataUrl)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load fail')) }
    img.src = url
  })
}

export function removeSongCover(id: string): void {
  const all = getAll()
  delete all[id]
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch {}
}
