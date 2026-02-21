export function normalizeUrl(url, source = null) {
  // Auto-detect source if not provided
  if (!source) {
    source = detectSource(url)
  }

  // Amazon: extract product ID only
  if (source === 'amazon') {
    try {
      const parsed = new URL(url)
      const dpMatch = parsed.pathname.match(/\/(dp|gp\/product)\/([A-Z0-9]+)/)
      if (dpMatch) {
        return `${parsed.origin}/dp/${dpMatch[2]}`
      }
    } catch {
      return url.split('?')[0].replace(/\/$/, '')
    }
  }

  // YouTube: normalize to standard watch URL
  if (source === 'youtube') {
    try {
      const parsed = new URL(url)
      if (parsed.hostname === 'youtu.be') {
        const videoId = parsed.pathname.slice(1)
        return `https://www.youtube.com/watch?v=${videoId}`
      }
      const videoId = parsed.searchParams.get('v')
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url
    } catch {
      return url
    }
  }

  // YouTube Music: extract playlist ID
  if (source === 'youtubemusic') {
    try {
      const parsed = new URL(url)
      const list = parsed.searchParams.get('list')
      return list ? `${parsed.origin}${parsed.pathname}?list=${list}` : url
    } catch {
      return url
    }
  }

  // Google Maps: remove query params
  if (source === 'googlemaps') {
    try {
      const parsed = new URL(url)
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '')
    } catch {
      return url.split('?')[0].replace(/\/$/, '')
    }
  }

  // Default: strip query params and trailing slash
  return url.split('?')[0].replace(/\/$/, '')
}

function detectSource(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname.includes('amazon.')) return 'amazon'
    if (hostname.includes('music.youtube.com')) return 'youtubemusic'
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube'
    if (hostname.includes('google.') && url.includes('/maps')) return 'googlemaps'
  } catch {}
  return null
}
