export interface SongFolder {
  id: string
  name: string
  songIds: string[]
  collapsed: boolean
}

const KEY = 'srz-song-folders'

export function getSongFolders(): SongFolder[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveSongFolders(folders: SongFolder[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(folders)) } catch {}
}
