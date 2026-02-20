import { getSession } from '../lib/auth.js'
import { getAllLists, getAllItems } from '../lib/db.js'
import { getCached, setCache, clearCache } from '../lib/cache.js'
import { showToast } from '../utils/ui.js'
import { initAddItemForm } from '../components/add-item-form.js'
import { setupScrollHide } from '../utils/scroll.js'
import { renderNavUser } from '../utils/nav.js'
import { initQuickSwitcher } from '../components/quick-switcher.js'

const PAGE_SIZE = 60

let allLists = []
let allItems = []
let listsOffset = 0
let itemsOffset = 0
let hasMoreLists = true
let hasMoreItems = true
let isLoading = false
let currentView = 'lists' // Change to 'all' to re-enable items on explore
let currentSort = 'recent'
let currentType = ''

// Kick off initial data fetch immediately at module level
const _initialDataPromise = getAllLists({ from: 0, to: PAGE_SIZE - 1 })
const _authPromise = getSession().then(s => s?.user || null)

async function init() {
  document.title = 'Discover — Syft'
  setupControls()

  // Run data render and auth in parallel
  const [user] = await Promise.all([
    _authPromise,
    renderInitialData()
  ])

  renderNavUser(document.getElementById('user-email'), user)
  setupObserver()
  setupScrollHide()

  if (user) {
    initQuickSwitcher()
    document.querySelector('main').classList.replace('lg:pb-8', 'sm:pb-18')
    document.querySelector('main').classList.replace('pb-4', 'pb-[122px]')
    await initAddItemForm({
      onItemAdded: () => resetAndLoad(),
      onListCreated: () => resetAndLoad()
    })

    // Handle Web Share Target: pre-fill input with shared URL
    const params = new URLSearchParams(window.location.search)
    const sharedUrl = params.get('url') || extractUrl(params.get('text'))
    if (sharedUrl) {
      const input = document.getElementById('add-item-input')
      if (input) {
        input.value = sharedUrl
        input.dispatchEvent(new Event('input'))
        input.focus()
      }
      history.replaceState(null, '', window.location.pathname)
    }
  }
}

async function renderInitialData() {
  const container = document.getElementById('explore-container')
  const sentinel = document.getElementById('load-more-sentinel')

  // Try cache first for instant back-navigation
  const cached = getCached('discover_v3')
  if (cached) {
    allLists = cached
    listsOffset = cached.length
    if (cached.length < PAGE_SIZE) hasMoreLists = false
    container.insertAdjacentHTML('beforeend', cached.map(renderListCard).join(''))
    updateSentinel()
    return
  }

  sentinel.classList.remove('hidden')

  try {
    const lists = await _initialDataPromise
    allLists = lists
    listsOffset = lists.length
    if (lists.length < PAGE_SIZE) hasMoreLists = false
    container.insertAdjacentHTML('beforeend', lists.map(renderListCard).join(''))
    setCache('discover_v3', lists)
    updateSentinel()
  } catch (error) {
    showToast(error.message, 'error')
    sentinel.classList.add('hidden')
  }
}

function extractUrl(text) {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s]+/)
  return match ? match[0] : null
}

function resetState() {
  allLists = []
  allItems = []
  listsOffset = 0
  itemsOffset = 0
  hasMoreLists = true
  hasMoreItems = true
}

async function resetAndLoad() {
  isLoading = true
  clearCache('discover_v3')
  resetState()
  await loadAndRender()
  isLoading = false
}

async function loadAndRender() {
  const container = document.getElementById('explore-container')
  const sentinel = document.getElementById('load-more-sentinel')



  sentinel.classList.add('hidden')
  container.style.minHeight = container.offsetHeight + 'px'
  container.innerHTML = ''

  if (currentSort === 'random') {
    sentinel.classList.remove('hidden')
    await loadAll()
    renderAll()
    sentinel.classList.add('hidden')
  } else {
    sentinel.classList.remove('hidden')
    const { newLists, newItems } = await loadPage()
    appendCards(newLists, newItems)
    updateSentinel()
  }
  container.style.minHeight = ''
}

async function loadAll() {
  try {
    const [lists, items] = await Promise.all([getAllLists(), getAllItems()])
    allLists = lists
    allItems = items
    hasMoreLists = false
    hasMoreItems = false
  } catch (error) {
    showToast(error.message, 'error')
  }
}

async function loadPage() {
  let newLists = []
  let newItems = []

  try {
    if (currentView === 'lists' || currentView === 'all') {
      if (hasMoreLists) {
        const sortBy = currentSort === 'created' ? 'created_at' : 'updated_at'
        const lists = await getAllLists({ from: listsOffset, to: listsOffset + PAGE_SIZE - 1, sortBy })
        newLists = lists
        allLists = [...allLists, ...lists]
        listsOffset += lists.length
        if (lists.length < PAGE_SIZE) hasMoreLists = false
      }
    }

    if (currentView === 'items' || currentView === 'all') {
      if (hasMoreItems) {
        const items = await getAllItems({ from: itemsOffset, to: itemsOffset + PAGE_SIZE - 1 })
        newItems = items
        allItems = [...allItems, ...items]
        itemsOffset += items.length
        if (items.length < PAGE_SIZE) hasMoreItems = false
      }
    }
  } catch (error) {
    showToast(error.message, 'error')
  }

  return { newLists, newItems }
}

function renderAll() {
  const container = document.getElementById('explore-container')

  if (currentView === 'lists') {
    container.innerHTML = shuffle([...allLists]).map(renderListCard).join('')
  } else if (currentView === 'items') {
    let items = allItems
    if (currentType) items = items.filter(item => item.type === currentType)
    container.innerHTML = shuffle([...items]).map(renderItemCard).join('')
  } else {
    const tagged = [
      ...allLists.map(l => ({ ...l, _type: 'list', _timestamp: l.updated_at })),
      ...allItems.map(i => ({ ...i, _type: 'item', _timestamp: i.created_at }))
    ]
    container.innerHTML = shuffle(tagged).map(entry =>
      entry._type === 'list' ? renderListCard(entry) : renderItemCard(entry)
    ).join('')
  }
}

function appendCards(newLists, newItems) {
  const container = document.getElementById('explore-container')
  let html = ''

  if (currentView === 'lists') {
    html = newLists.map(renderListCard).join('')
  } else if (currentView === 'items') {
    let items = newItems
    if (currentType) items = items.filter(item => item.type === currentType)
    html = items.map(renderItemCard).join('')
  } else {
    const tagged = [
      ...newLists.map(l => ({ ...l, _type: 'list', _timestamp: l.updated_at })),
      ...newItems.map(i => ({ ...i, _type: 'item', _timestamp: i.created_at }))
    ]
    tagged.sort((a, b) => new Date(b._timestamp) - new Date(a._timestamp))
    html = tagged.map(entry =>
      entry._type === 'list' ? renderListCard(entry) : renderItemCard(entry)
    ).join('')
  }

  container.insertAdjacentHTML('beforeend', html)
}

function hasMore() {
  if (currentView === 'lists') return hasMoreLists
  if (currentView === 'items') return hasMoreItems
  return hasMoreLists || hasMoreItems
}

function updateSentinel() {
  const sentinel = document.getElementById('load-more-sentinel')
  if (hasMore()) {
    sentinel.classList.remove('hidden')
  } else {
    sentinel.classList.add('hidden')
  }
}

function setupObserver() {
  const sentinel = document.getElementById('load-more-sentinel')
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting || isLoading || !hasMore()) return
    isLoading = true
    const { newLists, newItems } = await loadPage()
    appendCards(newLists, newItems)
    updateSentinel()
    isLoading = false
  })
  observer.observe(sentinel)
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function setupControls() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view
      updateControls()
      resetAndLoad()
    })
  })

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSort = btn.dataset.sort
      updateControls()
      resetAndLoad()
    })
  })

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type
      updateControls()
      resetAndLoad()
    })
  })

  updateControls()
}

function updateControls() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    const active = btn.dataset.view === currentView
    btn.innerHTML = btn.dataset.view.charAt(0).toUpperCase() + btn.dataset.view.slice(1) + (active ? ' <span class="active-dot w-1.5 h-1.5 bg-green-500 shadow-[0_0_6px_var(--color-green-500)] block rounded-full mb-[7px]"></span>' : '')
    btn.classList.toggle('text-gray-800', active)
    btn.classList.toggle('font-semibold', active)
  })

  document.querySelectorAll('.sort-btn').forEach(btn => {
    const active = btn.dataset.sort === currentSort
    const labels = { recent: 'Updated', created: 'Created', random: 'Random' }
    const label = labels[btn.dataset.sort] || btn.dataset.sort
    btn.innerHTML = `<span class="active-dot w-1.5 h-1.5 block rounded-full mb-[7px] ${active ? 'bg-green-500 shadow-[0_0_6px_var(--color-green-500)]' : 'bg-gray-300'}"></span>` + label
    btn.classList.toggle('text-gray-800', active)
    btn.classList.toggle('font-semibold', active)
  })

  const typeControls = document.getElementById('type-controls')
  const typeControls2 = document.getElementById('type-controls-2')
  if (typeControls && typeControls2) {
    if (currentView === 'items') {
      typeControls.classList.remove('hidden')
      typeControls2.classList.remove('hidden')
    } else {
      typeControls.classList.add('hidden')
      typeControls2.classList.add('hidden')
    }
  }

  const typeLabels = { book: 'Books', movie: 'Movies', show: 'Shows', album: 'Albums', artist: 'Artists', product: 'Products' }
  document.querySelectorAll('.type-btn').forEach(btn => {
    const active = btn.dataset.type === currentType
    const label = btn.dataset.type ? typeLabels[btn.dataset.type] || btn.dataset.type : 'All'
    btn.innerHTML = label + (active ? ' <span class="active-dot"></span>' : '')
    btn.classList.toggle('text-gray-800', active)
    btn.classList.toggle('font-semibold', active)
  })
}

function renderListCard(list) {
  const allItems = (list.preview_items || []).map(pi => pi.items)

  const coverImages = allItems
    .filter(item => item?.cover_image_url)
    .slice(0, 9)

  const textItems = allItems
    .filter(item => item?.type === 'text' && !item?.cover_image_url)
    .slice(0, 9 - coverImages.length)

  const previewCircles = (coverImages.length > 0 || textItems.length > 0)
    ? `<div class="flex gap-1.5 overflow-x-scroll px-3 mb-4 scrollbar-track-transparent scrollbar-thumb-transparent scrollbar-thin">
        ${coverImages.map(item => `
          <a href="${item.url}" target="_blank" rel="noopener" class="aspect-square flex justify-center items-center p-1 w-16 h-16 border border-gray-100 hover:border-gray-200 transition-colors rounded-[3px]">
            <img src="${item.cover_image_url}" alt="" class="h-full object-contain rounded-[3px]">
          </a>
        `).join('')}
        ${textItems.map(item => `
          <div class="aspect-square flex items-end p-1 w-16 h-16 border border-gray-100 transition-colors rounded-[3px]">
            <p class="text-[10px] leading-3 font-medium text-gray-500 line-clamp-3 overflow-hidden text-ellipsis">${escapeHtml(item.title)}</p>
          </div>
        `).join('')}
      </div>`
    : ''

  const profile = list.profiles
  const creatorHtml = profile
    ? profile.avatar_url
      ? `<div class="pb-3 ml-3 mr-3 pt-2 text-xs border-t border-gray-200 transition-opacity"><a href="/profile.html?id=${profile.id}" class="text-xs font-medium text-gray-800 hover:underline">${escapeHtml(profile.display_name || profile.email)}</a></div>`
      : `<div class="pb-3 pt-2 text-xs border-t border-gray-200 transition-opacity"><a href="/profile.html?id=${profile.id}" class="text-xs font-medium text-gray-800 hover:underline">${escapeHtml(profile.display_name || profile.email)}</a></div>`
    : ''

  return `
    <div class="group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md flex flex-col justify-end h-full gap-1">
      <div class="">
        <h3 class="px-3 wrap-break-word text-pretty leading-5 pb-[2px] text-xl font-medium text-ellipsis line-clamp-3 mb-3">
          <a href="/list.html?list=${list.slug}" class="aspect-[5/3] flex items-end block hover:underline">${escapeHtml(list.name)}</a>
        </h3>
        <div class="flex items-center justify-between">
          <div class="flex items-center w-full overflow-hidden">
            ${previewCircles}
          </div>
        </div>
        ${creatorHtml}
      </div>
    </div>
  `
}

function renderItemCard(item) {
  const listItem = item.list_items?.[0]
  const list = listItem?.lists
  const profile = list?.profiles

  let metaHtml = ''
  if (list) {
    const userHtml = profile
      ? profile.avatar_url
        ? `<a href="/profile.html?id=${profile.id}" class="hover:underline font-medium text-gray-800 mr-1">${escapeHtml(profile.display_name || profile.email)}</a>`
        : `<a href="/profile.html?id=${profile.id}" class="hover:underline font-medium text-gray-800 mr-1">${escapeHtml(profile.display_name || profile.email)}</a>`
      : ''
    metaHtml = `<div class="sm:mt-2 mt-6 border-t pt-2 bg-white border-gray-200 sm:opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-xs text-gray-500 leading-4">${userHtml}<span>in</span><a href="/list.html?list=${list.slug || list.id}" class="ml-1 hover:underline font-medium text-gray-800">${escapeHtml(list.name)}</a></div>`
  }

  return `
    <div>
      <div class="relative group hover:border-gray-300 border bg-white border-gray-200 transition-colors rounded-md p-3 h-full flex flex-col">
        ${item.cover_image_url
          ? `<div><a class="mb-3 grow-0 aspect-square flex justify-center items-center p-6 bg-white border border-gray-100 group-hover:border-gray-200 transition-colors rounded-[3px]" href="${item.url}" target="_blank" rel="noopener">
              <img src="${item.cover_image_url}" alt="${escapeHtml(item.title)}" class="h-full object-contain ${item.type === 'artist' ? 'rounded-full' : 'rounded-[3px]'}">
            </a></div>`
          : ''
        }
        <div class="justify-between flex flex-col grow">
          <div class="">
            <h3 class="leading-[24px] text-ellipsis line-clamp-2 font-medium sm:mb-1 sm:text-base text-sm"><a href="${item.url}" target="_blank" rel="noopener" class="hover:underline">${escapeHtml(item.title)}</a></h3>
            ${item.price ? `<p class="sm:text-sm text-xs text-gray-500">${escapeHtml(item.price)}</p>` : item.creator ? `<p class="sm:text-sm text-xs text-gray-500">${escapeHtml(item.creator)}</p>` : ''}
          </div>
        </div>
        ${metaHtml}
      </div>
    </div>
  `
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

init()
