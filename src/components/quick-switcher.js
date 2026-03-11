import { getAllLists } from '../lib/db.js'
import { getSessionUserIdSync } from '../lib/auth.js'

const RECENT_KEY = 'syft_recent_lists'
const MAX_RECENT = 6
const RECENT_ITEMS_KEY = 'syft_recent_items'
const MAX_RECENT_ITEMS = 9

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function trackRecentList({ id, slug, name, count, coverImages }) {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const recent = Array.isArray(parsed) ? parsed : []
    const filtered = recent.filter(l => l.id !== id)
    filtered.unshift({ id, slug, name, count, coverImages })
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
  } catch {}
}

export function trackRecentItem({ url, cover_image_url, title, type }) {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) || '[]')
    const recent = Array.isArray(parsed) ? parsed : []
    const filtered = recent.filter(i => i.url !== url)
    filtered.unshift({ url, cover_image_url, title, type })
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT_ITEMS)))
  } catch {}
}

export function removeRecentItem(url) {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) || '[]')
    const recent = Array.isArray(parsed) ? parsed : []
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(recent.filter(i => i.url !== url)))
  } catch {}
}

export function updateRecentListName(id, name, slug) {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const recent = Array.isArray(parsed) ? parsed : []
    const updated = recent.map(l =>
      String(l.id) === String(id) ? { ...l, name, slug } : l
    )
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to update recent list name:', e)
  }
}

export function initQuickSwitcher() {
  let overlay = null
  let searchInput = null
  let resultsContainer = null
  let focusedIndex = 0
  let allLists = null
  let listsPromise = null

  function getRecent() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }

  function getRecentItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }

  function renderRecentItemsStrip() {
    const items = getRecentItems()
    if (items.length === 0) return ''
    const circles = items.map(item =>
      item.cover_image_url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="active:scale-97 aspect-square flex justify-center items-center p-1 w-20 h-20 shrink-0 border border-gray-200 hover:border-gray-300 transition-colors rounded-[3px]">
            <img src="${escapeHtml(item.cover_image_url)}" alt="" loading="lazy" class="h-full object-contain rounded-[3px]">
          </a>`
        : `<div class="aspect-square flex items-end p-1 w-20 h-20 shrink-0 border border-gray-200 rounded-[3px]">
            <p class="text-[10px] leading-3 text-balance font-medium text-gray-500 line-clamp-2 overflow-hidden text-ellipsis">${escapeHtml(item.title)}</p>
          </div>`
    ).join('')
    return `<div class="py-3 border-b border-gray-100">
      <div class="flex space-x-1.5 overflow-x-auto px-3 scrollbar-none">${circles}</div>
    </div>`
  }

  function renderItem(list) {
    const images = (list.coverImages || []).slice(0, 3)
    const circles = images.length > 0
      ? `<span class="flex -space-x-2">${images.map(url =>
          `<span class="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-gray-100"><img src="${escapeHtml(url)}" alt="" loading="lazy" class="w-full h-full object-cover"></span>`
        ).join('')}</span>`
      : ''
    const creatorLine = !list.isOwner && list.creator
      ? `<span class="text-xs text-gray-400 truncate block">${escapeHtml(list.creator)}</span>`
      : ''

    return `<a href="/list.html?list=${escapeHtml(list.slug)}" data-qs-item class="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
      <span class="min-w-0 mr-3">
        <span class="text-sm font-medium truncate block">${escapeHtml(list.name)}</span>
        ${creatorLine}
      </span>
      <span class="flex items-center gap-1.5 shrink-0">
        <span class="text-xs text-gray-400">${list.count ?? 0} ${(list.count ?? 0) === 1 ? 'item' : 'items'}</span>
        ${circles}
      </span>
    </a>`
  }

  function getDisplayLists(filter) {
    if (!allLists) {
      const recent = getRecent()
      if (!filter) return recent.slice(0, MAX_RECENT)
      const lower = filter.toLowerCase()
      return recent.filter(l => l.name.toLowerCase().includes(lower))
    }
    // Merge: recent lists first (in visit order), then remaining lists
    const recent = getRecent()
    const recentIds = new Set(recent.map(r => r.id))
    const recentMapped = recent
      .map(r => {
        const list = allLists.find(l => String(l.id) === String(r.id))
        // Prefer updated name/slug from recent lists over allLists
        return list ? { ...list, name: r.name, slug: r.slug, count: r.count } : null
      })
      .filter(Boolean)
    const rest = allLists.filter(l => !recentIds.has(l.id))
    const merged = [...recentMapped, ...rest]
    if (!filter) return merged.slice(0, MAX_RECENT)
    const lower = filter.toLowerCase()
    const filtered = merged.filter(l => l.name.toLowerCase().includes(lower))
    return filtered.sort((a, b) => (b.isOwner ? 1 : 0) - (a.isOwner ? 1 : 0))
  }

  function renderResults(filter) {
    const lists = getDisplayLists(filter)
    focusedIndex = lists.length > 0 ? 0 : -1
    const strip = filter ? '' : renderRecentItemsStrip()
    if (lists.length === 0) {
      resultsContainer.innerHTML = strip + '<p class="px-4 py-6 text-sm text-gray-400 text-center">No lists found</p>'
    } else {
      resultsContainer.innerHTML = strip + lists.map(renderItem).join('')
    }
    updateFocus()
  }

  function getItems() {
    return resultsContainer.querySelectorAll('[data-qs-item]')
  }

  function updateFocus() {
    getItems().forEach((item, i) => {
      if (i === focusedIndex) {
        item.classList.add('bg-gray-50')
        item.classList.remove('hover:bg-gray-50')
        item.scrollIntoView({ block: 'nearest' })
      } else {
        item.classList.remove('bg-gray-50')
        item.classList.add('hover:bg-gray-50')
      }
    })
  }

  function open() {
    document.body.style.overflow = 'hidden'
    if (overlay) {
      const qs = document.getElementById('quick-switcher')
      overlay.style.animation = 'none'
      if (qs) qs.style.animation = 'none'
      overlay.offsetHeight // trigger reflow to restart animations
      overlay.style.animation = ''
      if (qs) qs.style.animation = ''
      overlay.classList.remove('hidden')
      searchInput.value = ''
      renderResults('')
      if (window.innerWidth >= 640) searchInput.focus()
      return
    }

    document.body.insertAdjacentHTML('beforeend', `
      <div id="quick-switcher-overlay" class="fixed inset-0 bg-gray-200/50 z-50 flex items-end sm:items-start justify-center sm:pt-[20vh]">
        <div id="quick-switcher" class="shadow-xl bg-white rounded-t-md sm:rounded-md w-full sm:max-w-md overflow-hidden sm:mx-4">
          <input id="qs-search" type="text" placeholder="Search lists..." autocomplete="off"
            class="w-full px-4 h-12 sm:h-auto sm:py-3 text-sm border-b border-gray-200 outline-none placeholder:text-gray-500">
          <div id="qs-results" class="overflow-y-auto max-h-[380px]"></div>
        </div>
      </div>
    `)

    overlay = document.getElementById('quick-switcher-overlay')
    searchInput = document.getElementById('qs-search')
    resultsContainer = document.getElementById('qs-results')

    renderResults('')
    if (window.innerWidth >= 640) searchInput.focus()

    searchInput.addEventListener('input', () => renderResults(searchInput.value))

    searchInput.addEventListener('keydown', (e) => {
      const items = getItems()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusedIndex = Math.min(focusedIndex + 1, items.length - 1)
        updateFocus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusedIndex = Math.max(focusedIndex - 1, 0)
        updateFocus()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (focusedIndex >= 0 && items[focusedIndex]) {
          window.location.href = items[focusedIndex].href
        }
      } else if (e.key === 'Escape') {
        close()
      }
    })

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close()
    })
  }

  function close() {
    if (overlay) overlay.classList.add('hidden')
    document.body.style.overflow = ''
  }

  // Prefetch all public lists on page load so data is ready when Cmd+K is pressed
  const userId = getSessionUserIdSync()
  listsPromise = getAllLists().then(lists => {
    allLists = lists.map(l => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      count: l.list_items[0].count,
      coverImages: (l.preview_items || []).map(pi => pi.items?.cover_image_url).filter(Boolean).slice(0, 3),
      isOwner: l.user_id === userId,
      creator: l.profiles?.display_name || l.profiles?.email || null
    }))
  }).catch(() => {})

  const searchBtn = document.getElementById('search-btn')
  if (searchBtn) searchBtn.addEventListener('click', () => open())

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      if (overlay && !overlay.classList.contains('hidden')) close()
      else open()
    }
  })
}
