const PREFIX = 'syft_'
const MAX_AGE = 5 * 60 * 1000 // 5 minutes

export function getCached(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > MAX_AGE) {
      localStorage.removeItem(PREFIX + key)
      return null
    }
    return data
  } catch (e) {
    console.warn('[cache] getCached error:', key, e)
    return null
  }
}

export function setCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch (e) {
    console.warn('[cache] setCache error:', key, e)
  }
}

export function clearCache(key) {
  if (key) localStorage.removeItem(PREFIX + key)
}
