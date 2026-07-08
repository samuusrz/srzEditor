export function getUsageTimes(key: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') } catch { return {} }
}

export function recordUsage(key: string, id: string): void {
  const all = getUsageTimes(key)
  all[id] = Date.now()
  try { localStorage.setItem(key, JSON.stringify(all)) } catch {}
}
