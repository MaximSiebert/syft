import { getList, getListBySlug, getListItems, removeItemFromList, deleteList, updateList, updateItem, reorderListItem } from '../lib/db.js'
import { getSession, getSessionUserIdSync } from '../lib/auth.js'
import { getCached, setCache, clearCache } from '../lib/cache.js'
import { showToast, inlineConfirm } from '../utils/ui.js'
import { initAddItemForm } from '../components/add-item-form.js'
import { setupScrollHide } from '../utils/scroll.js'
import { renderNavUser } from '../utils/nav.js'
import { initQuickSwitcher, trackRecentList } from '../components/quick-switcher.js'
import Sortable from 'sortablejs'

const PAGE_SIZE = 60

let currentListId = null
let currentListName = null
let isOwner = false
let itemsOffset = 0
let hasMoreItems = true
let isLoading = false
let _listData = null
let _pendingSave = null
let _searchCache = null

// Kick off data fetch at module level
const _params = new URLSearchParams(window.location.search)
const _slug = _params.get('list')
const _idParam = _params.get('id')
const _cacheKey = _slug ? 'list:' + _slug : _idParam ? 'list:' + _idParam : null
const _authPromise = getSession().then(s => s?.user || null)
const _listPromise = _slug ? getListBySlug(_slug) : _idParam ? getList(_idParam) : null

async function init() {
  if (!_listPromise) {
    window.location.href = '/'
    return
  }

  const cached = _cacheKey ? getCached(_cacheKey) : null
  let list, user

  if (cached) {
    list = cached.list
    currentListId = list.id
    _listData = list

    // Determine ownership synchronously so we can render from cache instantly
    const syncUserId = getSessionUserIdSync()
    isOwner = syncUserId ? list.user_id === syncUserId : false
    loadList(syncUserId ? { id: syncUserId } : null, list)

    // Render cached items immediately (no await)
    const container = document.getElementById('items-container')
    const sentinel = document.getElementById('load-more-sentinel')
    itemsOffset = cached.itemsOffset
    hasMoreItems = cached.hasMoreItems
    if (cached.items.length === 0) {
      container.innerHTML = isOwner
        ? '<div class="w-full relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-between h-full gap-1"><p class="sm:text-xl text-lg pt-40 font-medium">Add your first item below</p></div>'
        : '<div class="w-full relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-between h-full gap-1"><p class="sm:text-xl text-lg pt-40 font-medium">No items yet</p></div>'
    } else {
      container.insertAdjacentHTML('beforeend', renderItemCards(cached.items))
    }
    if (hasMoreItems) sentinel.classList.remove('hidden')
    else sentinel.classList.add('hidden')

    // Await auth after rendering for nav and forms
    user = await _authPromise
    renderNavUser(document.getElementById('user-email'), user)
  } else {
    try {
      ;[list, user] = await Promise.all([_listPromise, _authPromise])
    } catch {
      window.location.href = '/'
      return
    }
    currentListId = list.id
    _listData = list
    renderNavUser(document.getElementById('user-email'), user)
    loadList(user, list)
    await loadItems()
  }

  trackRecentList({
    id: list.id,
    slug: list.slug || _slug,
    name: list.name,
    count: itemsOffset,
    coverImages: cached
      ? cached.items.map(li => li.items?.cover_image_url).filter(Boolean).slice(0, 3)
      : []
  })

  setupObserver()
  setupRemoveHandler()
  setupInlineEditing()
  setupDragReorder()
  setupScrollHide()
  initSearch()
  initQuickSwitcher()

  if (user) {
    document.querySelector('main').classList.replace('lg:pb-8', 'sm:pb-18')
    document.querySelector('main').classList.replace('pb-4', 'pb-[122px]')
    await initAddItemForm({
      defaultListId: currentListId,
      onItemAdded: (listId) => { if (listId === currentListId) resetAndLoadItems() }
    })
  }

  if (isOwner) {
    const deleteBtn = document.getElementById('delete-list-btn')
    deleteBtn?.addEventListener('click', () => {
      if (deleteBtn.dataset.confirming === 'true') return

      const originalHtml = deleteBtn.innerHTML
      deleteBtn.dataset.confirming = 'true'

      // Expand button
      deleteBtn.classList.remove('w-8', 'h-8', 'hover:bg-white')
      deleteBtn.classList.add('sm:w-60', 'sm:left-auto', 'left-3', 'h-12', 'px-3', 'bg-white')

      // Replace icon with confirm input
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'Type "delete" to confirm...'
      input.className = 'w-full h-full bg-transparent outline-none text-sm'
      deleteBtn.innerHTML = ''
      deleteBtn.appendChild(input)
      input.focus()

      const reset = () => {
        deleteBtn.classList.remove('sm:w-60', 'left-3', 'sm:left-3', 'h-12', 'px-3')
        deleteBtn.classList.add('w-8', 'h-8')
        deleteBtn.innerHTML = originalHtml
        delete deleteBtn.dataset.confirming
      }

      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') return reset()
        if (e.key !== 'Enter') return
        if (input.value.trim().toLowerCase() !== 'delete') return reset()

        input.disabled = true
        try {
          await deleteList(currentListId)
          window.location.href = '/profile.html'
        } catch (error) {
          showToast(error.message, 'error')
          reset()
        }
      })

      input.addEventListener('blur', () => reset())
    })
  } else {
    // Read-only: hide owner controls
    const deleteBtn = document.getElementById('delete-list-btn')
    if (deleteBtn) deleteBtn.style.display = 'none'
  }
}

function setAllNames(name) {
  document.querySelectorAll('.list-name').forEach(el => {
    el.textContent = name
  })
}

function loadList(user, list) {
  try {
    currentListName = list.name
    isOwner = user ? list.user_id === user.id : false
    setAllNames(list.name)
    document.title = `${list.name} — Syft`

    // Update URL to use slug
    if (list.slug) {
      history.replaceState(null, '', `/list.html?list=${list.slug}`)
    }


    const profile = list.profiles
    const authorEl = document.getElementById('list-author')
    if (profile) {
      const creatorName = profile.display_name || profile.email || ''
      if (authorEl && creatorName) {
        authorEl.innerHTML = `${profile.avatar_url ? `by <img src="${profile.avatar_url}" alt="" class="ml-1 w-5 h-5 rounded-full">` : ''} <span class="font-semibold text-gray-800 group-hover:underline">${escapeHtml(creatorName)}</span>`
        authorEl.href = `/profile.html?id=${profile.id}`
      } else if (authorEl) {
        authorEl.innerHTML = ''
      }
    } else if (authorEl) {
      authorEl.innerHTML = ''
    }

    if (isOwner) {
      const listHeader = document.getElementById('list-header')
      if (listHeader) {
        listHeader.classList.add('hover:bg-white', 'hover:border-gray-300')
      }

      document.querySelectorAll('.list-name').forEach(nameEl => {
        nameEl.contentEditable = true
        nameEl.style.cursor = 'text'

        nameEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            nameEl.blur()
          }
          if (e.key === 'Escape') {
            setAllNames(currentListName)
            nameEl.blur()
          }
        })

        nameEl.addEventListener('blur', async () => {
          const newName = nameEl.textContent.trim()
          if (!newName) {
            setAllNames(currentListName)
            return
          }
          if (newName === currentListName) return

          if (_cacheKey) clearCache(_cacheKey)
          const savePromise = updateList(currentListId, { name: newName })
          _pendingSave = savePromise
          try {
            const updated = await savePromise
            currentListName = updated.name
            setAllNames(updated.name)
            document.title = `${updated.name} — Syft`
            if (updated.slug) {
              history.replaceState(null, '', `/list.html?list=${updated.slug}`)
            }
          } catch (error) {
            setAllNames(currentListName)
            showToast(error.message, 'error')
          } finally {
            if (_pendingSave === savePromise) _pendingSave = null
          }
        })
      })
    } else {
      // Show creator info for non-owned lists
      const profile = list.profiles
      if (profile) {
        const creatorEl = document.getElementById('list-creator')
        if (creatorEl) {
          creatorEl.innerHTML = profile.avatar_url
            ? `<img src="${profile.avatar_url}" alt="" class="w-6 h-6 rounded-full">`
            : `<span class="text-sm text-gray-500">${escapeHtml(profile.display_name || profile.email)}</span>`
        }
      }
    }
  } catch (error) {
    showToast('List not found', 'error')
    window.location.href = '/profile.html'
  }
}

async function resetAndLoadItems() {
  isLoading = true
  _searchCache = null
  clearCache('discover')
  if (_cacheKey) clearCache(_cacheKey)
  itemsOffset = 0
  hasMoreItems = true
  document.getElementById('load-more-sentinel').classList.add('hidden')
  const container = document.getElementById('items-container')
  container.style.minHeight = container.offsetHeight + 'px'
  container.innerHTML = ''
  await loadItems()
  container.style.minHeight = ''
  isLoading = false
}

function renderItemCards(listItems) {
  return listItems.map(listItem => {
    const item = listItem.items

    if (item.type === 'text') {
      return `
        <div class="min-w-0" data-item-id="${listItem.id}">
          <div class="group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-end h-full gap-1">
            <h3 class="item-title leading-[24px] wrap-break-word text-pretty sm:text-xl text-lg pt-24 font-medium outline-none" data-item-id="${item.id}" data-original="${escapeHtml(item.title)}" ${isOwner ? 'contenteditable="true" style="cursor:text"' : ''}>${escapeHtml(item.title)}</h3>
            ${isOwner ? `
            <div class="h-6 items-center mt-2 pt-2 text-xs border-t border-gray-200 transition-opacity">
              <button class="active:scale-95 h-4 remove-btn text-xs font-medium text-gray-300 hover:text-gray-800 transition-colors cursor-pointer" data-item-id="${listItem.id}" title="Remove">
                <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.8 -0.8 16 16" id="Delete-Bin-3--Streamline-Micro" height="16" width="16">
                  <desc>
                    Delete Bin 3 Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.08 3.6057600000000005h12.240000000000002" stroke-width="1.6"></path>
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M10.440000000000001 13.680000000000001h-6.48a1.4400000000000002 1.4400000000000002 0 0 1 -1.4400000000000002 -1.4400000000000002v-8.64h9.360000000000001v8.64a1.4400000000000002 1.4400000000000002 0 0 1 -1.4400000000000002 1.4400000000000002Z" stroke-width="1.6"></path>
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M4.6195200000000005 3.6000000000000005v-0.32976000000000005a2.55024 2.55024 0 1 1 5.10048 0V3.6000000000000005" stroke-width="1.6"></path>
                </svg>
              </button>
            </div>` : ''}
          </div>
        </div>
      `
    }

    return `
      <div class="min-w-0" data-item-id="${listItem.id}">
        <div class="group hover:border-gray-300 border bg-white border-gray-200 transition-colors rounded-md p-3 h-full flex flex-col">
          ${item.cover_image_url
            ? `<div><a class="mb-3 grow-0 aspect-square flex justify-center items-center sm:p-3 p-1.5 border border-gray-100 group-hover:border-gray-200 transition-colors rounded-[3px]" href="${item.url}" target="_blank" rel="noopener">
                  <img src="${item.cover_image_url}" alt="${escapeHtml(item.title)}" class="h-full object-contain ${item.type === 'artist' ? 'rounded-full' : 'rounded-[3px]'}">
                </a></div>`
            : ''
          }
          <div class="justify-between flex flex-col grow">
            <div>
              <h3 class="item-title leading-5 wrap-break-word text-pretty text-ellipsis line-clamp-2 font-medium mb-1 sm:text-base text-sm outline-none" data-item-id="${item.id}" data-original="${escapeHtml(item.title)}" ${isOwner ? 'contenteditable="true" style="cursor:text"' : ''}>${isOwner ? escapeHtml(item.title) : `<a href="${item.url}" target="_blank" rel="noopener" class="hover:underline">${escapeHtml(item.title)}</a>`}</h3>
              ${item.price
                ? `<p class="item-desc leading-4 sm:text-sm text-xs text-gray-500 text-ellipsis line-clamp-2 outline-none" data-item-id="${item.id}" data-field="price" data-original="${escapeHtml(item.price)}" ${isOwner ? 'contenteditable="true" style="cursor:text"' : ''}>${escapeHtml(item.price)}</p>`
                : item.creator
                  ? `<p class="item-desc leading-4 sm:text-sm text-xs text-gray-500 text-ellipsis line-clamp-2 outline-none" data-item-id="${item.id}" data-field="creator" data-original="${escapeHtml(item.creator)}" ${isOwner ? 'contenteditable="true" style="cursor:text"' : ''}>${escapeHtml(item.creator)}</p>`
                  : ''}
            </div>
            ${isOwner ? `<div class="h-6 items-center mt-3 pt-2 text-xs border-t border-gray-200 transition-opacity ">
              <button class="active:scale-95 h-4 remove-btn text-xs font-medium text-gray-300 hover:text-gray-800 transition-colors cursor-pointer" data-item-id="${listItem.id}" title="Remove">
              <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.8 -0.8 16 16" id="Delete-Bin-3--Streamline-Micro" height="16" width="16">
                <desc>
                  Delete Bin 3 Streamline Icon: https://streamlinehq.com
                </desc>
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.08 3.6057600000000005h12.240000000000002" stroke-width="1.6"></path>
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M10.440000000000001 13.680000000000001h-6.48a1.4400000000000002 1.4400000000000002 0 0 1 -1.4400000000000002 -1.4400000000000002v-8.64h9.360000000000001v8.64a1.4400000000000002 1.4400000000000002 0 0 1 -1.4400000000000002 1.4400000000000002Z" stroke-width="1.6"></path>
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M4.6195200000000005 3.6000000000000005v-0.32976000000000005a2.55024 2.55024 0 1 1 5.10048 0V3.6000000000000005" stroke-width="1.6"></path>
              </svg>
            </button></div>` : ''}
          </div>
        </div>
      </div>
    `
  }).join('')
}

async function loadItems() {
  const container = document.getElementById('items-container')
  const sentinel = document.getElementById('load-more-sentinel')
  const isFirstPage = itemsOffset === 0

  try {
    sentinel.classList.remove('hidden')
    const listItems = await getListItems(currentListId, { from: itemsOffset, to: itemsOffset + PAGE_SIZE - 1 })
    itemsOffset += listItems.length
    if (listItems.length < PAGE_SIZE) hasMoreItems = false

    if (isFirstPage && listItems.length === 0) {
      container.innerHTML = isOwner
        ? '<div class="w-full relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-between h-full gap-1"><p class="sm:text-xl text-lg pt-40 font-medium">Add your first item below</p></div>'
        : '<div class="w-full relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-between h-full gap-1"><p class="sm:text-xl text-lg pt-40 font-medium">No items yet</p></div>'
      sentinel.classList.add('hidden')
      if (_cacheKey) setCache(_cacheKey, { list: { id: currentListId, name: currentListName, slug: _slug, user_id: null, profiles: null }, items: [], itemsOffset: 0, hasMoreItems: false })
      return
    }

    container.insertAdjacentHTML('beforeend', renderItemCards(listItems))

    if (isFirstPage && _cacheKey && _listData) {
      setCache(_cacheKey, { list: _listData, items: listItems, itemsOffset, hasMoreItems })
    }

    if (hasMoreItems) {
      sentinel.classList.remove('hidden')
    } else {
      sentinel.classList.add('hidden')
    }
  } catch (error) {
    if (isFirstPage) container.innerHTML = '<p>Failed to load items</p>'
    showToast(error.message, 'error')
    sentinel.classList.add('hidden')
  }
}

function setupRemoveHandler() {
  if (!isOwner) return
  const container = document.getElementById('items-container')
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-btn')
    if (!btn) return
    if (!inlineConfirm(btn)) return

    try {
      await removeItemFromList(btn.dataset.itemId)
      showToast('Item removed', 'success')
      await resetAndLoadItems()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })
}

function setupDragReorder() {
  if (!isOwner) return

  const container = document.getElementById('items-container')
  container.classList.add('reorderable')

  Sortable.create(container, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    forceFallback: true,
    fallbackOnBody: true,
    fallbackClass: 'sortable-drag',
    delay: 200,
    delayOnTouchOnly: true,
    filter: '.remove-btn, .item-title, .item-desc',
    preventOnFilter: false,
    onEnd: async (evt) => {
      if (evt.oldIndex !== evt.newIndex) {
        try {
          await reorderListItem(currentListId, evt.item.dataset.itemId, evt.newIndex)
        } catch {
          await resetAndLoadItems()
        }
      }
    }
  })
}

function setupInlineEditing() {
  if (!isOwner) return
  const container = document.getElementById('items-container')

  container.addEventListener('keydown', (e) => {
    const el = e.target.closest('.item-title, .item-desc')
    if (!el) return
    if (e.key === 'Enter') {
      e.preventDefault()
      el.blur()
    }
    if (e.key === 'Escape') {
      el.textContent = el.dataset.original
      el.blur()
    }
  })

  container.addEventListener('focusout', async (e) => {
    const el = e.target.closest('.item-title, .item-desc')
    if (!el) return

    const newValue = el.textContent.trim()
    const original = el.dataset.original
    if (!newValue || newValue === original) {
      el.textContent = original
      return
    }

    const itemId = el.dataset.itemId
    const field = el.classList.contains('item-title') ? 'title' : el.dataset.field

    if (_cacheKey) clearCache(_cacheKey)
    const savePromise = updateItem(itemId, { [field]: newValue })
    _pendingSave = savePromise
    try {
      const updated = await savePromise
      el.dataset.original = updated[field]
      el.textContent = updated[field]
    } catch (error) {
      el.textContent = original
      showToast(error.message, 'error')
    } finally {
      if (_pendingSave === savePromise) _pendingSave = null
    }
  })
}

// Strip formatting on paste in any contenteditable field
document.addEventListener('paste', (e) => {
  const el = e.target.closest('[contenteditable="true"]')
  if (!el) return
  e.preventDefault()
  const text = e.clipboardData.getData('text/plain')
  document.execCommand('insertText', false, text)
})

// Intercept link clicks while a save is in-flight to prevent request cancellation
document.addEventListener('click', (e) => {
  if (!_pendingSave) return
  const link = e.target.closest('a[href]')
  if (!link) return
  e.preventDefault()
  const href = link.href
  _pendingSave.finally(() => { window.location.href = href })
}, true)

function initSearch() {
  const card = document.getElementById('search-card')
  const input = document.getElementById('search-input')
  const clearBtn = document.getElementById('search-clear')

  card.addEventListener('click', () => input.focus())

  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase()

    if (!q) {
      clearBtn.classList.add('hidden')
      _searchCache = null
      await resetAndLoadItems()
      return
    }

    clearBtn.classList.remove('hidden')

    if (!_searchCache) {
      _searchCache = await getListItems(currentListId)
    }

    const filtered = _searchCache.filter(li =>
      li.items.title?.toLowerCase().includes(q) ||
      li.items.creator?.toLowerCase().includes(q)
    )

    const container = document.getElementById('items-container')
    document.getElementById('load-more-sentinel').classList.add('hidden')
    container.innerHTML = filtered.length > 0
      ? renderItemCards(filtered)
      : '<div class="w-full relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-between h-full gap-1"><p class="sm:text-xl text-lg pt-40 font-medium">No results</p></div>'
  })

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    input.value = ''
    clearBtn.classList.add('hidden')
    _searchCache = null
    resetAndLoadItems()
  })
}

function setupObserver() {
  const sentinel = document.getElementById('load-more-sentinel')
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting || isLoading || !hasMoreItems) return
    isLoading = true
    await loadItems()
    isLoading = false
  })
  observer.observe(sentinel)
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

init()
