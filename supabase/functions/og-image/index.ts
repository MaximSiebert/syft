import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import satori, { init as initSatori } from "https://esm.sh/satori@0.10.14/wasm"
import initYoga from "https://esm.sh/yoga-wasm-web@0.3.3"
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.4.1"

// Initialize WASM modules (runs once on cold start)
const yoga = await initYoga(
  await fetch("https://unpkg.com/yoga-wasm-web@0.3.3/dist/yoga.wasm").then(r => r.arrayBuffer())
)
initSatori(yoga)

await initWasm(
  await fetch("https://unpkg.com/@resvg/resvg-wasm@2.4.1/index_bg.wasm").then(r => r.arrayBuffer())
)

// Load Inter font (regular + bold) from Google Fonts
const fontCss = await fetch(
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;700',
  { headers: { 'User-Agent': 'satori' } }
).then(r => r.text())

const fontUrls = [...fontCss.matchAll(/src:\s*url\(([^)]+)\)/g)].map(m => m[1])
const [fontRegular, fontBold] = await Promise.all(
  fontUrls.slice(0, 2).map(url => fetch(url).then(r => r.arrayBuffer()))
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fetch a cover image and convert to base64 data URL
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return `data:${contentType};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

// Simple element tree builder (satori-compatible vnode)
function h(type: string, props: Record<string, any> = {}, ...children: any[]): any {
  return {
    type,
    props: {
      ...props,
      children: children.length <= 1 ? (children[0] ?? undefined) : children,
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const listId = url.searchParams.get('id')
    if (!listId) {
      return new Response('Missing id parameter', { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch list with creator profile
    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('name, profiles(display_name, email)')
      .eq('id', listId)
      .single()

    if (listError || !list) {
      return new Response('List not found', { status: 404 })
    }

    // Fetch first 9 items with covers + total count
    const { data: items, count } = await supabase
      .from('list_items')
      .select('items(cover_image_url)', { count: 'exact' })
      .eq('list_id', listId)
      .order('position', { ascending: true })
      .limit(9)

    const coverUrls = (items || [])
      .map((i: any) => i.items?.cover_image_url)
      .filter(Boolean)
      .slice(0, 9)

    // Fetch cover images as base64 in parallel
    const coverData = await Promise.all(coverUrls.map(fetchImageAsBase64))

    const listName = list.name || 'Untitled List'
    const profile = (list as any).profiles
    const creatorName = profile?.display_name || profile?.email || ''
    const itemCount = count || 0

    // Layout constants (matching mockup)
    const coverSize = 170
    const coverGap = 12
    const gridWidth = 3 * coverSize + 2 * coverGap

    // Build cover elements (3x3 grid, placeholders for missing)
    const coverElements = Array.from({ length: 9 }, (_, i) => {
      const dataUrl = coverData[i]
      if (dataUrl) {
        return h('img', {
          src: dataUrl,
          width: coverSize,
          height: coverSize,
          style: { borderRadius: '8px', objectFit: 'cover' },
        })
      }
      return h('div', {
        style: {
          width: `${coverSize}px`,
          height: `${coverSize}px`,
          borderRadius: '8px',
          background: '#e7e5e4',
          flexShrink: 0,
        },
      })
    })

    // Build element tree
    const element = h('div', {
      style: {
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#fafaf9',
        padding: '48px',
        fontFamily: 'Inter',
      },
    },
      // Left: 3x3 cover grid
      h('div', {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${coverGap}px`,
          width: `${gridWidth}px`,
          flexShrink: 0,
        },
      }, ...coverElements),

      // Right: text content
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          marginLeft: '40px',
          flex: 1,
        },
      },
        // Top: list name + item count
        h('div', {
          style: { display: 'flex', flexDirection: 'column' },
        },
          h('div', {
            style: {
              fontSize: '42px',
              fontWeight: 700,
              color: '#1c1917',
              lineHeight: 1.2,
            },
          }, listName),
          h('div', {
            style: {
              fontSize: '22px',
              color: '#78716c',
              marginTop: '4px',
            },
          }, `${itemCount} item${itemCount !== 1 ? 's' : ''}`),
        ),

        // Bottom: creator + Syft (with border-top)
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #e7e5e4',
            paddingTop: '16px',
          },
        },
          h('div', {
            style: { fontSize: '20px', color: '#78716c' },
          }, creatorName ? `by ${creatorName}` : ''),
          h('div', {
            style: { fontSize: '20px', color: '#78716c' },
          }, 'Syft'),
        ),
      ),
    )

    // Generate SVG with satori
    const svg = await satori(element, {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' as const },
        { name: 'Inter', data: fontBold, weight: 700, style: 'normal' as const },
      ],
    })

    // Convert SVG to PNG with resvg
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width' as const, value: 1200 },
    })
    const pngData = resvg.render()
    const pngBuffer = pngData.asPng()

    return new Response(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        ...corsHeaders,
      },
    })
  } catch (error) {
    console.error('OG image generation error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
