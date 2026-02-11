import { supabase } from './supabase.js'

// ============================================
// LISTS
// ============================================

export async function getLists(userId, { from, to } = {}) {
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    userId = user.id
  }

  let query = supabase
    .from('lists')
    .select(`
      *,
      list_items(
        added_at,
        items:item_id(cover_image_url)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (from != null && to != null) query = query.range(from, to)

  const { data, error } = await query

  if (error) throw error

  // Process to add count and preview items
  return data.map(list => ({
    ...list,
    list_items: [{ count: list.list_items.length }],
    preview_items: list.list_items
      .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
      .slice(0, 3)
  }))
}

export async function getList(id) {
  const { data, error } = await supabase
    .from('lists')
    .select(`
      *,
      profiles:user_id(id, display_name, avatar_url, email)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createList(name) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('lists')
    .insert({ user_id: user.id, name })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateList(id, updates) {
  const { data, error } = await supabase
    .from('lists')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteList(id) {
  const { data: listItems, error: fetchError } = await supabase
    .from('list_items')
    .select('item_id')
    .eq('list_id', id)

  if (fetchError) throw fetchError

  const { error: removeError } = await supabase
    .from('list_items')
    .delete()
    .eq('list_id', id)

  if (removeError) throw removeError

  if (listItems.length > 0) {
    const itemIds = listItems.map(li => li.item_id)
    const { error: itemsError } = await supabase
      .from('items')
      .delete()
      .in('id', itemIds)

    if (itemsError) throw itemsError
  }

  const { error } = await supabase
    .from('lists')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============================================
// LIST ITEMS
// ============================================

export async function getListItems(listId, { from, to } = {}) {
  let query = supabase
    .from('list_items')
    .select(`
      id,
      added_at,
      items:item_id (
        id,
        title,
        creator,
        cover_image_url,
        url,
        type,
        source
      )
    `)
    .eq('list_id', listId)
    .order('position', { ascending: true })

  if (from != null && to != null) query = query.range(from, to)

  const { data, error } = await query

  if (error) throw error
  return data
}

export async function addItemToList(url, listId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const response = await supabase.functions.invoke('scrape-item', {
    body: { url, list_id: listId },
  })

  if (response.error) {
    const ctx = response.error.context
    const message = (ctx && ctx.error) || response.error.message || 'Failed to add item'
    throw new Error(message)
  }

  return response.data
}

export async function addTextItemToList(text, listId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({ title: text, url: '', type: 'text', source: null })
    .select()
    .single()
  if (itemError) throw itemError

  await supabase.rpc('shift_list_positions', { p_list_id: listId })

  const { error: linkError } = await supabase
    .from('list_items')
    .insert({ list_id: listId, item_id: item.id, position: 0 })
  if (linkError) throw linkError

  return item
}

export async function removeItemFromList(listItemId) {
  const { data: listItem, error: fetchError } = await supabase
    .from('list_items')
    .select('item_id')
    .eq('id', listItemId)
    .single()

  if (fetchError) throw fetchError

  const { error: removeError } = await supabase
    .from('list_items')
    .delete()
    .eq('id', listItemId)

  if (removeError) throw removeError

  const { error: deleteError } = await supabase
    .from('items')
    .delete()
    .eq('id', listItem.item_id)

  if (deleteError) throw deleteError
}

export async function updateItem(itemId, updates) {
  const { data, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function reorderListItem(listId, itemId, newPosition) {
  const { error } = await supabase.rpc('reorder_list_item', {
    p_list_id: listId,
    p_item_id: itemId,
    p_new_position: newPosition
  })
  if (error) throw error
}

// ============================================
// EXPLORE
// ============================================

export async function getAllLists({ from, to, sortBy = 'updated_at' } = {}) {
  let query = supabase
    .from('lists')
    .select(`
      *,
      profiles:user_id(id, display_name, avatar_url, email),
      list_items(
        added_at,
        items:item_id(cover_image_url)
      )
    `)
    .order(sortBy, { ascending: false })

  if (from != null && to != null) query = query.range(from, to)

  const { data, error } = await query

  if (error) throw error

  return data.map(list => ({
    ...list,
    list_items: [{ count: list.list_items.length }],
    preview_items: list.list_items
      .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
      .slice(0, 3)
  }))
}

export async function getAllItems({ from, to } = {}) {
  let query = supabase
    .from('items')
    .select(`
      *,
      list_items(
        lists:list_id(id, name, user_id, profiles:user_id(id, display_name, avatar_url, email))
      )
    `)
    .order('created_at', { ascending: false })

  if (from != null && to != null) query = query.range(from, to)

  const { data, error } = await query

  if (error) throw error
  return data
}

// ============================================
// PROFILE
// ============================================

export async function getProfile(userId) {
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    userId = user.id
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

export async function migrateAvatarIfNeeded(userId, avatarUrl) {
  if (!avatarUrl) return avatarUrl
  if (avatarUrl.includes('/storage/v1/object/public/')) return avatarUrl

  try {
    const res = await fetch(avatarUrl)
    if (!res.ok) return avatarUrl

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
    const ext = extMap[contentType] || 'jpg'
    const filePath = `${userId}.${ext}`

    const blob = await res.blob()
    const { error } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, { contentType, upsert: true })

    if (error) return avatarUrl

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    return publicUrl
  } catch {
    return avatarUrl
  }
}

export async function updateProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}
