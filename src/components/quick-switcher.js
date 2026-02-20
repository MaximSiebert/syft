import { getLists } from '../lib/db.js'
import { getSessionUserIdSync } from '../lib/auth.js'

const RECENT_KEY = 'syft_recent_lists'
const MAX_RECENT = 6

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

  function renderItem(list) {
    const images = (list.coverImages || []).slice(0, 3)
    const circles = images.length > 0
      ? `<span class="flex -space-x-2">${images.map(url =>
          `<span class="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-gray-100"><img src="${escapeHtml(url)}" alt="" loading="lazy" class="w-full h-full object-cover"></span>`
        ).join('')}</span>`
      : ''

    return `<a href="/list.html?list=${escapeHtml(list.slug)}" data-qs-item class="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer">
      <span class="text-sm font-medium truncate">${escapeHtml(list.name)}</span>
      <span class="flex items-center gap-1.5 shrink-0 ml-3">
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
      .map(r => allLists.find(l => l.id === r.id))
      .filter(Boolean)
    const rest = allLists.filter(l => !recentIds.has(l.id))
    const merged = [...recentMapped, ...rest]
    if (!filter) return merged.slice(0, MAX_RECENT)
    const lower = filter.toLowerCase()
    return merged.filter(l => l.name.toLowerCase().includes(lower))
  }

  function renderResults(filter) {
    const lists = getDisplayLists(filter)
    focusedIndex = lists.length > 0 ? 0 : -1
    if (lists.length === 0) {
      resultsContainer.innerHTML = '<p class="px-4 py-6 text-sm text-gray-400 text-center">No lists found</p>'
    } else {
      resultsContainer.innerHTML = lists.map(renderItem).join('')
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
    if (overlay) { overlay.classList.remove('hidden'); searchInput.value = ''; renderResults(''); searchInput.focus(); return }

    document.body.insertAdjacentHTML('beforeend', `
      <div id="quick-switcher-overlay" class="fixed inset-0 bg-gray-200/50 z-50 flex items-start justify-center pt-[20vh]">
        <div id="quick-switcher" class="shadow-xl bg-white rounded-md w-full max-w-md overflow-hidden mx-4">
          <input id="qs-search" type="text" placeholder="Jump to list..." autocomplete="off"
            class="w-full px-4 py-3 text-sm border-b border-gray-200 outline-none">
          <div id="qs-results" class="overflow-y-auto max-h-[360px]"></div>
        </div>
      </div>
    `)

    overlay = document.getElementById('quick-switcher-overlay')
    searchInput = document.getElementById('qs-search')
    resultsContainer = document.getElementById('qs-results')

    renderResults('')
    searchInput.focus()

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
  }

  // Prefetch all lists on page load so data is ready when Cmd+K is pressed
  const userId = getSessionUserIdSync()
  if (userId) {
    listsPromise = getLists(userId).then(lists => {
      allLists = lists.map(l => ({
        id: l.id,
        slug: l.slug,
        name: l.name,
        count: l.list_items[0].count,
        coverImages: (l.preview_items || []).map(pi => pi.items?.cover_image_url).filter(Boolean).slice(0, 3)
      }))
    }).catch(() => {})
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      if (overlay && !overlay.classList.contains('hidden')) close()
      else open()
    }
  })
}
