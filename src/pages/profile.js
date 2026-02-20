import { getSession, getSessionUserIdSync } from '../lib/auth.js'
import { getLists, createList, getProfile } from '../lib/db.js'
import { getCached, setCache, clearCache } from '../lib/cache.js'
import { showToast } from '../utils/ui.js'
import { initAddItemForm } from '../components/add-item-form.js'
import { setupScrollHide } from '../utils/scroll.js'
import { renderNavUser } from '../utils/nav.js'
import { initQuickSwitcher } from '../components/quick-switcher.js'

const PAGE_SIZE = 60

let currentUserId = null
let offset = 0
let hasMore = true
let isLoading = false
let _cacheKey = null

// Kick off auth and profile fetch in parallel when viewing someone else's profile
const _params = new URLSearchParams(window.location.search)
const _profileId = _params.get('id')
const _authPromise = getSession().then(s => s?.user || null)
const _profilePromise = _profileId ? getProfile(_profileId) : null

function renderProfile(profile) {
  const displayName = profile.display_name || profile.email
  const titleEl = document.getElementById('page-title')
  if (titleEl) titleEl.textContent = `${displayName}'s lists`
  document.title = `${displayName}'s lists — Syft`

  const avatarSkeleton = document.getElementById('profile-avatar-skeleton')
  if (profile.avatar_url) {
    const avatarEl = document.getElementById('profile-avatar')
    if (avatarEl) {
      avatarEl.src = profile.avatar_url
      avatarEl.classList.remove('hidden')
    }
  }
  if (avatarSkeleton) avatarSkeleton.remove()
}

async function init() {
  // Compute cache key synchronously so we can render from cache before awaiting auth
  const syncUserId = getSessionUserIdSync()
  _cacheKey = 'profile:' + (_profileId || syncUserId || 'own')
  const cached = getCached(_cacheKey)

  if (cached) {
    // Render from cache immediately (no await)
    renderProfile(cached.profile)
    const container = document.getElementById('lists-container')
    const sentinel = document.getElementById('load-more-sentinel')
    offset = cached.listsOffset
    hasMore = cached.hasMore
    if (cached.lists.length === 0) {
      container.innerHTML = `
        <div class="relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col sm:col-span-1 col-span-2 justify-between h-full gap-1">
          <p class="leading-[24px] sm:text-xl text-lg pt-30 font-medium">Create your first list</p>
          <button data-expand-full class="active:scale-95 absolute top-3 right-3 create-list-btn text-sm hover:border-gray-300 focus:border-gray-300 border border-gray-200 cursor-pointer bg-gray-50 hover:bg-white focus:bg-white transition-colors h-8 w-8 flex items-center justify-center rounded-md">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.6 -0.6 12 12" id="Add-1--Streamline-Micro" height="12" width="12">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.4 0.54v9.72" stroke-width="1.2"></path>
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M0.54 5.4h9.72" stroke-width="1.2"></path>
            </svg>
          </button>
        </div>
      `
    } else {
      container.insertAdjacentHTML('beforeend', cached.lists.map(renderListCard).join(''))
    }
    if (hasMore) sentinel.classList.remove('hidden')
    else sentinel.classList.add('hidden')
  }

  // Await auth after cache rendering
  const user = await _authPromise

  // Own profile requires auth
  if (!_profileId && !user) {
    window.location.href = '/login.html'
    return
  }

  renderNavUser(document.getElementById('user-email'), user)

  const isOwnProfile = user && (!_profileId || _profileId === user.id)
  currentUserId = isOwnProfile ? undefined : _profileId

  if (!cached) {
    const profile = _profilePromise ? await _profilePromise : await getProfile(user.id)
    renderProfile(profile)
    await loadLists(_cacheKey, profile)
  }

  setupObserver()
  setupScrollHide()

  if (isOwnProfile) {
    // Show owner-only controls
    document.querySelectorAll('.create-list-btn').forEach(btn => btn.classList.remove('hidden'))
    const settingsBtn = document.getElementById('settings-btn')
    if (settingsBtn) settingsBtn.classList.remove('hidden')

    initQuickSwitcher()
    document.querySelector('main').classList.replace('lg:pb-8', 'sm:pb-18')
    document.querySelector('main').classList.replace('pb-4', 'pb-[122px]')
    setupCreateButtons()
    await initAddItemForm({
      onListCreated: () => resetAndLoad()
    })
  }
}

async function resetAndLoad() {
  isLoading = true
  clearCache('discover')
  if (_cacheKey) clearCache(_cacheKey)
  offset = 0
  hasMore = true
  document.getElementById('lists-container').innerHTML = ''
  await loadLists()
  isLoading = false
}

async function loadLists(cacheKey, profile) {
  const container = document.getElementById('lists-container')
  const sentinel = document.getElementById('load-more-sentinel')
  const isFirstPage = offset === 0

  try {
    sentinel.classList.remove('hidden')
    const lists = await getLists(currentUserId, { from: offset, to: offset + PAGE_SIZE - 1 })
    offset += lists.length
    if (lists.length < PAGE_SIZE) hasMore = false

    if (isFirstPage && lists.length === 0) {
      container.innerHTML = `
        <div class="relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col sm:col-span-1 col-span-2 justify-between h-full gap-1">
          <p class="leading-[24px] sm:text-xl text-lg pt-30 font-medium">Create your first list</p>
          <button data-expand-full class="absolute top-3 right-3 create-list-btn text-sm hover:border-gray-300 focus:border-gray-300 border border-gray-200 cursor-pointer bg-gray-50 hover:bg-white focus:bg-white transition-colors h-8 w-8 flex items-center justify-center rounded-md">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.6 -0.6 12 12" id="Add-1--Streamline-Micro" height="12" width="12">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.4 0.54v9.72" stroke-width="1.2"></path>
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M0.54 5.4h9.72" stroke-width="1.2"></path>
            </svg>
          </button>
        </div>
      `
      setupCreateButtons()
      sentinel.classList.add('hidden')
      if (cacheKey && profile) setCache(cacheKey, { profile, lists: [], listsOffset: 0, hasMore: false })
      return
    }

    container.insertAdjacentHTML('beforeend', lists.map(renderListCard).join(''))

    if (isFirstPage && cacheKey && profile) {
      setCache(cacheKey, { profile, lists, listsOffset: offset, hasMore })
    }

    if (hasMore) {
      sentinel.classList.remove('hidden')
    } else {
      sentinel.classList.add('hidden')
    }
  } catch (error) {
    container.innerHTML = '<p>Failed to load lists</p>'
    showToast(error.message, 'error')
    sentinel.classList.add('hidden')
  }
}

function setupObserver() {
  const sentinel = document.getElementById('load-more-sentinel')
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting || isLoading || !hasMore) return
    isLoading = true
    await loadLists()
    isLoading = false
  })
  observer.observe(sentinel)
}

function renderListCard(list) {
  const coverImages = (list.preview_items || [])
    .map(pi => pi.items?.cover_image_url)
    .filter(Boolean)
    .slice(0, 3)

  const previewCircles = coverImages.length > 0
    ? `<div class="flex -space-x-3">
        ${coverImages.map(url => `
          <div class="w-8 bg-gray-50 h-8 rounded-full border-3 border-white overflow-hidden bg-gray-100 relative after:inset-shadow-[0_0px_2px_rgba(0,0,0,0.2)] after:rounded-full after:content-[''] after:absolute after:inset-0">
            <img src="${url}" alt="" loading="lazy" class="w-full h-full object-cover">
          </div>
        `).join('')}
      </div>`
    : ''

  return `
    <a href="/list.html?list=${list.slug}" class="group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-end h-full gap-1">
      <h3 class="wrap-break-word text-pretty sm:text-xl text-lg leading-5 pb-[2px] pt-24 font-medium text-ellipsis line-clamp-3 hover:underline mb-1">${escapeHtml(list.name)}</h3>
      <div class="flex items-center gap-1 h-8">
        ${previewCircles}
        <p class="text-xs font-medium text-gray-500">${list.list_items[0].count} ${list.list_items[0].count === 1 ? 'item' : 'items'}</p>
      </div>
    </a>
  `
}

function setupCreateButtons() {
  document.querySelectorAll('.create-list-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.expanding === 'true') return

      const originalHtml = btn.innerHTML
      btn.dataset.expanding = 'true'

      // Expand button
      const expandFull = btn.hasAttribute('data-expand-full')
      btn.classList.remove('w-8', 'h-8', 'hover:bg-white', 'active:scale-95')
      btn.classList.add('h-12', 'px-3', 'bg-white')
      if (expandFull) {
        btn.classList.add('left-3')
      } else {
        btn.classList.add('sm:w-60', 'left-3', 'sm:left-auto')
      }

      // Replace icon with input
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'List name...'
      input.className = 'w-full h-full bg-transparent outline-none text-sm'
      btn.innerHTML = ''
      btn.appendChild(input)
      input.focus()

      const reset = () => {
        btn.classList.remove('h-12', 'px-3')
        if (expandFull) {
          btn.classList.remove('left-3', 'sm:left-auto')
        } else {
          btn.classList.remove('sm:w-60', 'left-3')
        }
        btn.classList.add('w-8', 'h-8', 'active:scale-95')
        btn.innerHTML = originalHtml
        delete btn.dataset.expanding
      }

      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') return reset()
        if (e.key !== 'Enter') return
        const name = input.value.trim()
        if (!name) return reset()

        input.disabled = true
        try {
          const list = await createList(name)
          window.location.href = `/list.html?list=${list.slug}`
        } catch (error) {
          showToast(error.message, 'error')
          reset()
        }
      })

      input.addEventListener('blur', () => reset())
    })
  })
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

init()
