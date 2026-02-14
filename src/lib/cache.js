const PREFIX = 'syft_'

export function getCached(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setCache(key, data) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch { /* quota exceeded */ }
}

export function clearCache(key) {
  sessionStorage.removeItem(PREFIX + key)
}
