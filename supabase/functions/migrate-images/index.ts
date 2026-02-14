import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

const BATCH_SIZE = 50
const MAX_IMAGE_WIDTH = 600

async function fetchImage(imageUrl: string): Promise<{ blob: Blob; contentType: string } | null> {
  const isSvg = /\.svg(\?|$)/i.test(imageUrl)
  if (!isSvg) {
    try {
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=${MAX_IMAGE_WIDTH}&we&output=jpg&q=85`
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) })
      if (res.ok) return { blob: await res.blob(), contentType: 'image/jpeg' }
    } catch { /* proxy failed, fall through to direct */ }
  }

  const res = await fetch(imageUrl, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': new URL(imageUrl).origin + '/',
    },
  })
  if (!res.ok) return null
  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  return { blob: await res.blob(), contentType }
}

async function uploadImageToStorage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  bucket: string,
  fileName: string
): Promise<string | null> {
  try {
    const result = await fetchImage(imageUrl)
    if (!result) {
      console.error(`Image download failed for ${imageUrl}`)
      return null
    }

    const ext = CONTENT_TYPE_TO_EXT[result.contentType] || 'jpg'
    const filePath = `${fileName}.${ext}`

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, result.blob, { contentType: result.contentType, upsert: true })

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

async function migrateCovers(supabase: ReturnType<typeof createClient>): Promise<{ migrated: number; failed: number }> {
  let migrated = 0
  let failed = 0
  let offset = 0

  while (true) {
    const { data: items, error } = await supabase
      .from('items')
      .select('id, cover_image_url')
      .not('cover_image_url', 'is', null)
      .not('cover_image_url', 'like', '%/storage/v1/object/public/%')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error('Error fetching items:', error.message)
      break
    }

    if (!items || items.length === 0) break

    for (const item of items) {
      const storageUrl = await uploadImageToStorage(
        supabase,
        item.cover_image_url,
        'covers',
        item.id
      )

      if (storageUrl) {
        const { error: updateError } = await supabase
          .from('items')
          .update({ cover_image_url: storageUrl })
          .eq('id', item.id)

        if (updateError) {
          console.error(`Failed to update item ${item.id}:`, updateError.message)
          failed++
        } else {
          migrated++
        }
      } else {
        failed++
      }
    }

    console.log(`Covers batch done: offset=${offset}, migrated=${migrated}, failed=${failed}`)

    if (items.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  return { migrated, failed }
}

async function migrateAvatars(supabase: ReturnType<typeof createClient>): Promise<{ migrated: number; failed: number }> {
  let migrated = 0
  let failed = 0
  let offset = 0

  while (true) {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .not('avatar_url', 'is', null)
      .not('avatar_url', 'like', '%/storage/v1/object/public/%')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error('Error fetching profiles:', error.message)
      break
    }

    if (!profiles || profiles.length === 0) break

    for (const profile of profiles) {
      const storageUrl = await uploadImageToStorage(
        supabase,
        profile.avatar_url,
        'avatars',
        profile.id
      )

      if (storageUrl) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: storageUrl })
          .eq('id', profile.id)

        if (updateError) {
          console.error(`Failed to update profile ${profile.id}:`, updateError.message)
          failed++
        } else {
          migrated++
        }
      } else {
        failed++
      }
    }

    console.log(`Avatars batch done: offset=${offset}, migrated=${migrated}, failed=${failed}`)

    if (profiles.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  return { migrated, failed }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let type = 'all'
    try {
      const body = await req.json()
      if (body.type) type = body.type
    } catch { /* default to all */ }

    const results: Record<string, { migrated: number; failed: number }> = {}

    if (type === 'all' || type === 'covers') {
      console.log('Starting cover image migration...')
      results.covers = await migrateCovers(supabase)
      console.log(`Covers done: ${results.covers.migrated} migrated, ${results.covers.failed} failed`)
    }

    if (type === 'all' || type === 'avatars') {
      console.log('Starting avatar migration...')
      results.avatars = await migrateAvatars(supabase)
      console.log(`Avatars done: ${results.avatars.migrated} migrated, ${results.avatars.failed} failed`)
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Migration error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
