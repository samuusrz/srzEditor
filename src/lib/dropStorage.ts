const KEY = 'srz-drop-points'

function load(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export function getDropPoint(songId: string): number | null {
  const v = load()[songId]
  return v !== undefined ? v : null
}

export function setDropPoint(songId: string, dropAt: number): void {
  const all = load()
  all[songId] = dropAt
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function removeDropPoint(songId: string): void {
  const all = load()
  delete all[songId]
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function getAllDropPoints(): Record<string, number> {
  return load()
}
