import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ItemData {
  url: string
  title: string
  creator: string | null
  cover_image_url: string | null
  type: 'book' | 'movie' | 'show' | 'album' | 'artist' | 'product' | 'location' | 'link'
  source: string
  price: string | null
}

type UrlType = {
  type: 'book' | 'movie' | 'show' | 'album' | 'artist' | 'product' | 'location' | 'link'
  source: string
  pattern?: RegExp
}

interface MicrolinkResponse {
  status: string
  data: {
    title?: string
    description?: string
    image?: { url?: string; width?: number; height?: number } | null
    author?: string
    publisher?: string
    date?: string
    logo?: { url?: string } | null
    lang?: string
    url?: string
    screenshot?: { url?: string }
  }
}

const urlTypes: UrlType[] = [
  { type: 'book', source: 'goodreads', pattern: /^https?:\/\/(www\.)?goodreads\.com\/book\/show\/.+/ },
  { type: 'product', source: 'amazon', pattern: /^https?:\/\/(www\.)?amazon\.(com|ca|co\.uk|com\.au|de|fr|es|it|nl|se|pl|co\.jp|com\.br|com\.mx|in|sg)\/.+\/(dp|gp\/product)\/[A-Z0-9]+/ },
  { type: 'book', source: 'indigo', pattern: /^https?:\/\/(www\.)?indigo\.ca\/.+\/\d+\.html/ },
  { type: 'movie', source: 'rottentomatoes', pattern: /^https?:\/\/(www\.)?rottentomatoes\.com\/m\/.+/ },
  { type: 'show', source: 'rottentomatoes', pattern: /^https?:\/\/(www\.)?rottentomatoes\.com\/tv\/.+/ },
  { type: 'movie', source: 'imdb', pattern: /^https?:\/\/(www\.)?imdb\.com\/title\/.+/ },
  { type: 'movie', source: 'justwatch', pattern: /^https?:\/\/(www\.)?justwatch\.com\/.+\/movie\/.+/ },
  { type: 'album', source: 'spotify', pattern: /^https?:\/\/open\.spotify\.com\/album\/.+/ },
  { type: 'album', source: 'applemusic', pattern: /^https?:\/\/music\.apple\.com\/.+\/album\/.+/ },
  { type: 'album', source: 'youtubemusic', pattern: /^https?:\/\/music\.youtube\.com\/playlist\?.+/ },
  { type: 'album', source: 'tidal', pattern: /^https?:\/\/(www\.|listen\.)?tidal\.com\/album\/.+/ },
  { type: 'album', source: 'qobuz', pattern: /^https?:\/\/(www\.)?qobuz\.com\/.+\/album\/.+/ },
  // Artists
  { type: 'artist', source: 'spotify', pattern: /^https?:\/\/open\.spotify\.com\/artist\/.+/ },
  { type: 'artist', source: 'applemusic', pattern: /^https?:\/\/music\.apple\.com\/.+\/artist\/.+/ },
  { type: 'artist', source: 'youtubemusic', pattern: /^https?:\/\/music\.youtube\.com\/channel\/.+/ },
  { type: 'artist', source: 'tidal', pattern: /^https?:\/\/(www\.|listen\.)?tidal\.com\/artist\/.+/ },
  { type: 'artist', source: 'qobuz', pattern: /^https?:\/\/(www\.)?qobuz\.com\/.+\/artist\/.+/ },
  // LCBO
  { type: 'product', source: 'lcbo', pattern: /^https?:\/\/(www\.)?lcbo\.com\/en\/.+/ },
  // E-commerce / Products - Shopify stores (myshopify.com or /products/ path)
  { type: 'product', source: 'shopify', pattern: /^https?:\/\/[^/]+\.myshopify\.com\/products\/.+/ },
  { type: 'product', source: 'shopify', pattern: /^https?:\/\/[^/]+\/.+\/products\/[^/]+$/ },
  { type: 'product', source: 'shopify', pattern: /^https?:\/\/[^/]+\/products\/[^/]+$/ },
  // Google Maps locations
  { type: 'location', source: 'googlemaps', pattern: /^https?:\/\/maps\.app\.goo\.gl\/.+/ },
  { type: 'location', source: 'googlemaps', pattern: /^https?:\/\/goo\.gl\/maps\/.+/ },
  { type: 'location', source: 'googlemaps', pattern: /^https?:\/\/(www\.)?google\.[a-z.]+\/maps\/place\/.+/ },
]

const PRERENDER_SOURCES = new Set<string>([])

function detectUrlType(url: string): UrlType {
  for (const urlType of urlTypes) {
    if (urlType.pattern && urlType.pattern.test(url)) {
      return urlType
    }
  }
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return { type: 'link', source: hostname }
  } catch {
    return { type: 'link', source: 'link' }
  }
}

function normalizeUrl(url: string, source: string): string {
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
  if (source === 'youtubemusic') {
    try {
      const parsed = new URL(url)
      const list = parsed.searchParams.get('list')
      return list ? `${parsed.origin}${parsed.pathname}?list=${list}` : url
    } catch {
      return url
    }
  }
  if (source === 'googlemaps') {
    try {
      const parsed = new URL(url)
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '')
    } catch {
      // Fall through to default
    }
  }
  return url.split('?')[0].replace(/\/$/, '')
}

// ============================================
// MICROLINK API
// ============================================

async function fetchMicrolink(url: string, prerender: boolean = false, screenshot: boolean = false): Promise<MicrolinkResponse | null> {
  try {
    const params = new URLSearchParams({ url })
    if (prerender) params.set('prerender', 'true')
    if (screenshot) params.set('screenshot', 'true')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(`https://api.microlink.io?${params.toString()}`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(`Microlink returned ${response.status} for ${url}`)
      return null
    }

    const data: MicrolinkResponse = await response.json()
    if (data.status !== 'success') {
      console.error(`Microlink status: ${data.status} for ${url}`)
      return null
    }

    return data
  } catch (error) {
    console.error(`Microlink fetch failed for ${url}:`, error)
    return null
  }
}

// ============================================
// METADATA MAPPING
// ============================================

function cleanTitle(title: string, source: string): string {
  const suffixPatterns: Record<string, RegExp[]> = {
    rottentomatoes: [/\s*[|–-]\s*Rotten Tomatoes$/i],
    imdb: [/\s*-\s*IMDb$/i, /\s*\(\d{4}\)\s*$/],
    justwatch: [/\s*\|\s*JustWatch$/i, /\s*-\s*watch streaming online$/i],
    indigo: [/\s*\|\s*Indigo.*$/i],
    applemusic: [/\s+on Apple Music$/i],
    youtubemusic: [/\s*[-–|]\s*YouTube Music$/i],
    tidal: [/\s*[-–|]\s*TIDAL$/i, /\s+on TIDAL$/i],
    qobuz: [/\s*[-–|]\s*Qobuz$/i],
    goodreads: [/\s*\|\s*Goodreads$/i, /\s+by\s+.+\s*\|\s*Goodreads$/i],
    googlemaps: [/\s*-\s*Explore in Google Maps$/i, /\s*[-–·]\s*Google Maps$/i, /\s*-\s*Google$/i],
  }

  let cleaned = title
  const patterns = suffixPatterns[source]
  if (patterns) {
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '')
    }
  }

  return cleaned.trim() || title
}

function extractTitle(rawTitle: string, source: string, type: string, url?: string, description?: string): string {
  let title = cleanTitle(rawTitle, source)

  // Indigo: title is often the filename ("9780743273565.html"), extract from description or URL
  if (source === 'indigo') {
    if (/^\d+\.html$/.test(title) || title === rawTitle) {
      // Try description: "Buy the book TITLE by AUTHOR at Indigo"
      if (description) {
        const descMatch = description.match(/^Buy the (?:book|product)\s+(.+?)\s+by\s+.+?\s+at\s+Indigo/i)
        if (descMatch) {
          title = descMatch[1].trim()
        }
      }
      // Fallback: extract from URL slug
      if ((/^\d+\.html$/.test(title)) && url) {
        const slugMatch = url.match(/\/([^/]+)\/\d+\.html/)
        if (slugMatch) {
          title = slugMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        }
      }
    }
  }

  // Apple Music: "Album Name by Artist on Apple Music" → "Album Name"
  if (source === 'applemusic' && type === 'album') {
    const byIndex = title.lastIndexOf(' by ')
    if (byIndex > 0) {
      title = title.substring(0, byIndex)
    }
  }

  // YouTube Music: "ALBUM - Album by Artist" → "ALBUM"
  if (source === 'youtubemusic' && type === 'album') {
    const albumByMatch = title.match(/^(.+?)\s*-\s*Album by\s+(.+)$/i)
    if (albumByMatch) {
      title = albumByMatch[1].trim()
    }
  }

  // Tidal: "Artist - Album" or "Album by Artist" → album name
  if (source === 'tidal' && type === 'album') {
    const byIndex = title.lastIndexOf(' by ')
    if (byIndex > 0) {
      title = title.substring(0, byIndex).trim()
    } else if (title.includes(' - ')) {
      const dashIndex = title.indexOf(' - ')
      title = title.substring(dashIndex + 3).trim()
    }
  }

  // Google Maps: extract clean place name from URL path (most reliable)
  if (source === 'googlemaps') {
    if (url) {
      const placeMatch = url.match(/\/maps\/place\/([^/@]+)/)
      if (placeMatch) {
        title = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
      } else {
        title = title.split(' · ')[0].trim()
      }
    } else {
      title = title.split(' · ')[0].trim()
    }
  }

  // Artists: clean up common suffixes
  if (type === 'artist') {
    title = title
      .replace(/\s+on Apple Music$/i, '')
      .replace(/\s*[-–]\s*YouTube Music$/i, '')
      .replace(/\s*[-–]\s*TIDAL$/i, '')
      .replace(/\s*[-–]\s*Qobuz$/i, '')
      .replace(/\s*[-–]\s*Listen on.*$/i, '')
      .trim()
  }

  return title || 'Unknown'
}

function extractCreator(
  data: MicrolinkResponse['data'],
  source: string,
  type: string,
  rawTitle: string
): string | null {
  // Artists have no subline creator
  if (type === 'artist') return null

  // Apple Music: "Album Name by Artist on Apple Music" → extract "Artist"
  if (source === 'applemusic' && type === 'album') {
    const cleaned = cleanTitle(rawTitle, source)
    const byIndex = cleaned.lastIndexOf(' by ')
    if (byIndex > 0) return cleaned.substring(byIndex + 4).trim()
  }

  // YouTube Music: "ALBUM - Album by Artist" → extract "Artist"
  if (source === 'youtubemusic' && type === 'album') {
    const cleaned = cleanTitle(rawTitle, source)
    const albumByMatch = cleaned.match(/^.+?\s*-\s*Album by\s+(.+)$/i)
    if (albumByMatch) return albumByMatch[1].trim()
  }

  // Tidal: "Album by Artist" or "Artist - Album" → extract artist
  if (source === 'tidal' && type === 'album') {
    const cleaned = cleanTitle(rawTitle, source)
    const byIndex = cleaned.lastIndexOf(' by ')
    if (byIndex > 0) return cleaned.substring(byIndex + 4).trim()
    if (cleaned.includes(' - ')) {
      return cleaned.substring(0, cleaned.indexOf(' - ')).trim()
    }
  }

  // Use author field from Microlink
  if (data.author) {
    let author = data.author
    // Filter out Amazon "Visit the X Store" brand links
    if (/^Visit the .+ Store$/i.test(author)) return null
    // Clean director prefixes for movies
    if (type === 'movie') {
      author = author
        .replace(/^Directors?:\s*/i, '')
        .replace(/^Directed by:\s*/i, '')
        .trim()
    }
    return author || null
  }

  // For locations, use description as address (skip generic Google Maps blurb)
  if (type === 'location' && data.description) {
    const desc = data.description
    if (desc.includes('Find local businesses, view maps')) return null
    const periodIdx = desc.indexOf('. ')
    const address = periodIdx > 0 ? desc.substring(periodIdx + 2) : desc
    return address.replace(/\.$/, '').trim() || null
  }

  // For generic links, use publisher as creator
  if (data.publisher) return data.publisher

  return null
}

function fixCoverImageUrl(imageUrl: string | null, source: string): string | null {
  if (!imageUrl) return null

  // Apple Music: resize to 600x600
  if (source === 'applemusic' && imageUrl.includes('mzstatic.com')) {
    return imageUrl
      .replace(/\{w\}x\{h\}bb\.\{f\}/, '600x600bb.jpg')
      .replace(/\/\d+x\d+[a-z]*\./, '/600x600bb.')
  }

  return imageUrl
}

function mapMicrolinkToItemData(
  microlinkData: MicrolinkResponse['data'],
  urlType: UrlType,
  normalizedUrl: string
): ItemData {
  const rawTitle = microlinkData.title || 'Unknown'
  const title = extractTitle(rawTitle, urlType.source, urlType.type, normalizedUrl, microlinkData.description || undefined)
  const creator = extractCreator(microlinkData, urlType.source, urlType.type, rawTitle)
  const cover_image_url = fixCoverImageUrl(microlinkData.image?.url || null, urlType.source)

  return {
    url: normalizedUrl,
    title,
    creator,
    cover_image_url,
    type: urlType.type,
    source: urlType.source,
    price: null,
  }
}

function fallbackItemData(url: string, urlType: UrlType, normalizedUrl: string): ItemData {
  let title = 'Unknown'
  let creator: string | null = null

  try {
    const parsed = new URL(url)

    if (urlType.source === 'googlemaps') {
      const placeMatch = parsed.pathname.match(/\/maps\/place\/([^/@]+)/)
      if (placeMatch) {
        title = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
      } else {
        title = 'Google Maps Location'
      }
    } else {
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      if (pathParts.length > 0) {
        title = decodeURIComponent(pathParts[pathParts.length - 1].replace(/[-_]/g, ' '))
      }
    }

    creator = parsed.hostname.replace(/^www\./, '')
  } catch {
    // URL parsing failed, use defaults
  }

  return {
    url: normalizedUrl,
    title,
    creator,
    cover_image_url: null,
    type: urlType.type,
    source: urlType.source,
    price: null,
  }
}

// ============================================
// SPOTIFY (oEmbed — kept as special case)
// ============================================

async function scrapeSpotifyApi(url: string): Promise<Partial<ItemData>> {
  let title: string | null = null
  let creator: string | null = null
  let cover_image_url: string | null = null

  try {
    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
    if (oembedRes.ok) {
      const data = await oembedRes.json()
      title = data.title || null
      cover_image_url = data.thumbnail_url || null
    }
  } catch { /* continue */ }

  try {
    const albumId = url.match(/\/album\/([a-zA-Z0-9]+)/)?.[1]
    if (albumId) {
      const embedRes = await fetch(`https://open.spotify.com/embed/album/${albumId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
      if (embedRes.ok) {
        const html = await embedRes.text()
        const match = html.match(/"subtitle"\s*:\s*"([^"]+)"/)
        if (match) {
          creator = match[1]
        }
      }
    }
  } catch { /* continue */ }

  return {
    title: title || 'Unknown Title',
    creator,
    cover_image_url,
  }
}

async function scrapeSpotifyArtistApi(url: string): Promise<Partial<ItemData>> {
  let title: string | null = null
  let cover_image_url: string | null = null

  try {
    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
    if (oembedRes.ok) {
      const data = await oembedRes.json()
      title = data.title || null
      cover_image_url = data.thumbnail_url || null
    }
  } catch { /* continue */ }

  return {
    title: title || 'Unknown Artist',
    creator: null,
    cover_image_url,
  }
}

// ============================================
// SHARED: Fetch OG tags from HTML
// ============================================

async function fetchOgTags(url: string): Promise<{ tags: Record<string, string>; html: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok) return { tags: {}, html: '' }
    const html = await res.text()
    const tags: Record<string, string> = {}
    for (const match of html.matchAll(/<meta\s+(?:property|name)="og:(\w+)"\s+content="([^"]+)"/g)) {
      tags[match[1]] = match[2]
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    }
    return { tags, html }
  } catch {
    return { tags: {}, html: '' }
  }
}

// ============================================
// YOUTUBE MUSIC (direct HTML — Microlink fails for playlists)
// ============================================

async function scrapeYouTubeMusicAlbum(url: string): Promise<Partial<ItemData>> {
  let title: string | null = null
  let creator: string | null = null
  let cover_image_url: string | null = null

  const { tags } = await fetchOgTags(url)

  if (tags.title) {
    const albumByMatch = tags.title.match(/^(.+?)\s*[-–]\s*Album by\s+(.+)$/i)
    if (albumByMatch) {
      title = albumByMatch[1].trim()
      creator = albumByMatch[2].trim()
    } else {
      title = tags.title.replace(/\s*[-|]\s*YouTube Music$/i, '').trim()
    }
  }

  if (!creator && tags.description) {
    const match = tags.description.match(/^Listen to .+? by (.+?) on YouTube Music/i)
    if (match) creator = match[1].trim()
  }

  if (tags.image) cover_image_url = tags.image

  return {
    title: title || 'Unknown Album',
    creator,
    cover_image_url,
  }
}

// ============================================
// IMDB (direct HTML — Microlink blocked by antibot)
// ============================================

async function scrapeIMDB(url: string): Promise<Partial<ItemData>> {
  let title: string | null = null
  let creator: string | null = null
  let cover_image_url: string | null = null
  let type: ItemData['type'] = 'movie'

  const { tags, html } = await fetchOgTags(url)

  // og:title: "The Shawshank Redemption (1994) ⭐ 9.3 | Drama"
  // og:title: "The Sopranos (TV Series 1999–2007) ⭐ 9.2 | Crime, Drama"
  if (tags.title) {
    // Detect TV shows from the title format
    if (/\(TV (?:Series|Mini Series)/i.test(tags.title)) {
      type = 'show'
    }
    title = tags.title.replace(/\s*\((?:TV (?:Series|Mini Series|Movie|Short|Special) )?\d{4}[^)]*\).*$/, '').trim()
  }

  if (tags.image) cover_image_url = tags.image

  // Extract from JSON-LD/HTML: director for movies, season count for shows
  if (html) {
    try {
      const ldMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)
      if (ldMatch) {
        const ld = JSON.parse(ldMatch[1])
        if (type === 'show' && ld.numberOfSeasons) {
          creator = `${ld.numberOfSeasons} Season${ld.numberOfSeasons === 1 ? '' : 's'}`
        } else if (type !== 'show' && ld.director) {
          const directors = Array.isArray(ld.director) ? ld.director : [ld.director]
          creator = directors.map((d: { name?: string }) => d.name).filter(Boolean).join(', ') || null
        }
      }
    } catch { /* JSON-LD parsing failed */ }

    // Fallback: extract season count from inline data for shows
    if (type === 'show' && !creator) {
      const seasonsMatch = html.match(/"seasons":\[([^\]]*)\]/)
      if (seasonsMatch) {
        const count = (seasonsMatch[1].match(/"number":/g) || []).length
        if (count > 0) {
          creator = `${count} Season${count === 1 ? '' : 's'}`
        }
      }
    }
  }

  return {
    title: title || (type === 'show' ? 'Unknown Show' : 'Unknown Movie'),
    creator,
    cover_image_url,
    type,
  }
}

// ============================================
// ROTTEN TOMATOES (direct HTML — Microlink blocked by antibot)
// ============================================

async function scrapeRottenTomatoes(url: string, isShow: boolean = false): Promise<Partial<ItemData>> {
  let title: string | null = null
  let creator: string | null = null
  let cover_image_url: string | null = null

  const { tags, html } = await fetchOgTags(url)

  // og:title: "The Shawshank Redemption | Rotten Tomatoes"
  if (tags.title) {
    title = tags.title.replace(/\s*\|\s*Rotten Tomatoes$/i, '').trim()
  }

  if (tags.image) cover_image_url = tags.image

  // Extract from JSON-LD: director for movies, numberOfSeasons for shows
  if (html) {
    try {
      const ldMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)
      if (ldMatch) {
        const ld = JSON.parse(ldMatch[1])
        if (isShow && ld.numberOfSeasons) {
          creator = `${ld.numberOfSeasons} Season${ld.numberOfSeasons === 1 ? '' : 's'}`
        } else if (ld.director) {
          const directors = Array.isArray(ld.director) ? ld.director : [ld.director]
          creator = directors.map((d: { name?: string }) => d.name).filter(Boolean).join(', ') || null
        }
      }
    } catch { /* JSON-LD parsing failed */ }
  }

  return {
    title: title || (isShow ? 'Unknown Show' : 'Unknown Movie'),
    creator,
    cover_image_url,
  }
}

// ============================================
// APPLE MUSIC ALBUM (direct HTML — Microlink returns 404)
// ============================================

async function scrapeAppleMusicAlbum(url: string): Promise<Partial<ItemData>> {
  let title: string | null = null
  let creator: string | null = null
  let cover_image_url: string | null = null

  const { tags } = await fetchOgTags(url)

  // og:title: "Abbey Road (2019 Mix) - Album by The Beatles - Apple Music"
  if (tags.title) {
    const albumByMatch = tags.title.match(/^(.+?)\s*-\s*Album by\s+(.+?)\s*-\s*Apple Music$/i)
    if (albumByMatch) {
      title = albumByMatch[1].trim()
      creator = albumByMatch[2].trim()
    } else {
      title = tags.title
        .replace(/\s*-\s*Apple Music$/i, '')
        .replace(/\s+on Apple Music$/i, '')
        .trim()
    }
  }

  if (tags.image) {
    cover_image_url = fixCoverImageUrl(tags.image, 'applemusic')
  }

  return {
    title: title || 'Unknown Album',
    creator,
    cover_image_url,
  }
}

// ============================================
// AMAZON (direct HTML — Microlink intermittently blocked)
// ============================================

async function scrapeAmazon(url: string): Promise<Partial<ItemData>> {
  let title: string | null = null
  let cover_image_url: string | null = null

  const { tags, html } = await fetchOgTags(url)

  if (tags.title) {
    title = tags.title
  }

  if (tags.image) {
    cover_image_url = tags.image
  }

  // Fallback: extract main product image from HTML
  if (!cover_image_url && html) {
    const imgMatch = html.match(/"hiRes"\s*:\s*"([^"]+)"/) ||
                     html.match(/"large"\s*:\s*"([^"]+)"/) ||
                     html.match(/id="landingImage"[^>]+src="([^"]+)"/)
    if (imgMatch) cover_image_url = imgMatch[1]
  }

  // Fallback title from HTML <title> tag
  if (!title && html) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/\s*:\s*Amazon\.\w+\s*:.*$/, '')
        .replace(/\s*-\s*Amazon\.\w+.*$/, '')
        .trim()
    }
  }

  return {
    title: title || 'Unknown Product',
    creator: null,
    cover_image_url,
  }
}

// ============================================
// LCBO (direct HTML — Microlink blocked by CloudFront WAF)
// ============================================

async function scrapeLCBO(url: string): Promise<Partial<ItemData>> {
  let title: string | null = null
  let cover_image_url: string | null = null
  let price: string | null = null

  const { tags, html } = await fetchOgTags(url)

  if (tags.title) {
    title = tags.title.replace(/\s*\|\s*LCBO$/i, '').trim()
  }

  if (tags.image) cover_image_url = tags.image

  // Try to extract price from HTML
  if (html) {
    const priceMatch = html.match(/<meta\s+(?:property|name)="product:price:amount"\s+content="([^"]+)"/) ||
                       html.match(/"price"\s*:\s*"?\$?([\d,.]+)"?/)
    if (priceMatch) {
      price = `$${priceMatch[1]}`
    }
  }

  return {
    title: title || 'Unknown Product',
    creator: null,
    cover_image_url,
    price,
  }
}

// ============================================
// GOOGLE MAPS (Places API — real place photos)
// ============================================

async function scrapeGoogleMaps(resolvedUrl: string): Promise<Partial<ItemData>> {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')

  // Extract place name from URL path: /maps/place/Place+Name/@lat,lng,...
  const placeMatch = resolvedUrl.match(/\/maps\/place\/([^/@]+)/)
  const query = placeMatch
    ? decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
    : null

  // Extract coordinates for location bias: /@45.4371,-75.6438,...
  const coordMatch = resolvedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  const lat = coordMatch ? parseFloat(coordMatch[1]) : null
  const lng = coordMatch ? parseFloat(coordMatch[2]) : null

  if (!query || !apiKey) {
    return { title: query || 'Google Maps Location' }
  }

  try {
    const body: Record<string, unknown> = { textQuery: query }
    // Use coordinates from the URL to bias search to the correct location
    if (lat && lng) {
      body.locationBias = {
        circle: { center: { latitude: lat, longitude: lng }, radius: 500.0 },
      }
    }

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.photos',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      console.error(`Places API returned ${res.status} for query: ${query}`)
      return { title: query }
    }

    const data = await res.json()
    const place = data.places?.[0]
    if (!place) return { title: query }

    const title = place.displayName?.text || query
    // Clean address: "465 Parkdale Ave, Ottawa, ON K1Y 1H5, Canada" → "465 Parkdale Ave, Ottawa, Canada"
    let creator: string | null = null
    if (place.formattedAddress) {
      const parts = place.formattedAddress.split(', ')
      if (parts.length >= 4) {
        parts.splice(-2, 1) // Remove province/state + postal code segment
      }
      creator = parts.join(', ')
    }

    let cover_image_url: string | null = null
    if (place.photos?.length > 0) {
      const photoName = place.photos[0].name
      cover_image_url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=800&key=${apiKey}`
    }

    return { title, creator, cover_image_url }
  } catch (error) {
    console.error(`Places API failed for ${query}:`, error)
    return { title: query }
  }
}

// ============================================
// STORAGE UPLOAD
// ============================================

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

async function uploadImageToStorage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  bucket: string,
  fileName: string
): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      console.error(`Image download failed (${res.status}) for ${imageUrl}`)
      return null
    }

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || ''
    const ext = CONTENT_TYPE_TO_EXT[contentType] || 'jpg'
    const filePath = `${fileName}.${ext}`

    const blob = await res.blob()
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, { contentType, upsert: true })

    if (error) {
      console.error(`Storage upload failed for ${filePath}:`, error.message)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return publicUrl
  } catch (error) {
    console.error(`uploadImageToStorage failed for ${imageUrl}:`, error)
    return null
  }
}

// ============================================
// HANDLER
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { url, list_id } = await req.json()

    if (!url || !list_id) {
      return new Response(
        JSON.stringify({ error: 'Missing url or list_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const urlType = detectUrlType(url)
    let normalizedUrl = normalizeUrl(url, urlType.source)

    // Verify user owns the list
    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('id, user_id')
      .eq('id', list_id)
      .single()

    if (listError || !list) {
      return new Response(
        JSON.stringify({ error: 'List not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (list.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to modify this list' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For Google Maps short URLs, resolve to get the full URL
    if (urlType.source === 'googlemaps' && (url.includes('goo.gl') || url.includes('maps.app'))) {
      try {
        // Try simple redirect resolution first (faster than Microlink)
        const redirectRes = await fetch(url, { method: 'HEAD', redirect: 'follow' })
        if (redirectRes.url && redirectRes.url.includes('/maps/place/')) {
          normalizedUrl = normalizeUrl(redirectRes.url, urlType.source)
        } else {
          // Fall back to Microlink prerender for JS-based redirects
          const resolveResult = await fetchMicrolink(url, true)
          if (resolveResult?.data?.url) {
            normalizedUrl = normalizeUrl(resolveResult.data.url, urlType.source)
          }
        }
      } catch {
        // Fall back to Microlink prerender
        const resolveResult = await fetchMicrolink(url, true)
        if (resolveResult?.data?.url) {
          normalizedUrl = normalizeUrl(resolveResult.data.url, urlType.source)
        }
      }
    }

    // Always create a new item record
    let scraped: Partial<ItemData>

    if (urlType.source === 'spotify' && urlType.type === 'album') {
      scraped = await scrapeSpotifyApi(url)
    } else if (urlType.source === 'spotify' && urlType.type === 'artist') {
      scraped = await scrapeSpotifyArtistApi(url)
    } else if (urlType.source === 'youtubemusic' && urlType.type === 'album') {
      scraped = await scrapeYouTubeMusicAlbum(url)
    } else if (urlType.source === 'imdb') {
      scraped = await scrapeIMDB(url)
    } else if (urlType.source === 'rottentomatoes') {
      scraped = await scrapeRottenTomatoes(url, urlType.type === 'show')
    } else if (urlType.source === 'applemusic' && urlType.type === 'album') {
      scraped = await scrapeAppleMusicAlbum(url)
    } else if (urlType.source === 'amazon') {
      scraped = await scrapeAmazon(normalizedUrl)
    } else if (urlType.source === 'lcbo') {
      scraped = await scrapeLCBO(url)
    } else if (urlType.source === 'googlemaps') {
      scraped = await scrapeGoogleMaps(normalizedUrl)
    } else {
      const microlinkResult = await fetchMicrolink(url, PRERENDER_SOURCES.has(urlType.source))

      if (microlinkResult) {
        scraped = mapMicrolinkToItemData(microlinkResult.data, urlType, normalizedUrl)
      } else {
        scraped = fallbackItemData(normalizedUrl, urlType, normalizedUrl)
      }
    }

    const item = {
      url: normalizedUrl,
      title: scraped.title || 'Unknown',
      creator: scraped.creator || null,
      cover_image_url: scraped.cover_image_url || null,
      type: scraped.type || urlType.type,
      source: urlType.source,
      price: scraped.price || null,
    }

    // Screenshot fallback: if no cover image, use Microlink screenshot
    if (!item.cover_image_url) {
      try {
        const screenshotResult = await fetchMicrolink(normalizedUrl, false, true)
        if (screenshotResult?.data?.screenshot?.url) {
          item.cover_image_url = screenshotResult.data.screenshot.url
        }
      } catch { /* screenshot fallback failed */ }
    }

    const { data: itemRecord, error: insertError } = await supabase
      .from('items')
      .insert(item)
      .select('id')
      .single()

    if (insertError || !itemRecord) {
      throw new Error(`Failed to save item: ${insertError?.message}`)
    }

    // Upload cover image to Storage
    if (item.cover_image_url) {
      const storageUrl = await uploadImageToStorage(
        supabase,
        item.cover_image_url,
        'covers',
        itemRecord.id
      )
      if (storageUrl) {
        await supabase
          .from('items')
          .update({ cover_image_url: storageUrl })
          .eq('id', itemRecord.id)
        item.cover_image_url = storageUrl
      }
    }

    // Shift existing positions to make room at top
    await supabase.rpc('shift_list_positions', { p_list_id: list_id })

    // Add to list_items at position 0 (top)
    const { error: listItemError } = await supabase
      .from('list_items')
      .insert({
        list_id,
        item_id: itemRecord.id,
        position: 0,
      })

    if (listItemError) {
      throw listItemError
    }

    return new Response(
      JSON.stringify({ success: true, item }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
