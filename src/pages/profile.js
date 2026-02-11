import { getCurrentUser, getSession } from '../lib/auth.js'
import { getLists, createList, getProfile } from '../lib/db.js'
import { showToast } from '../utils/ui.js'
import { initAddItemForm } from '../components/add-item-form.js'
import { setupScrollHide } from '../utils/scroll.js'
import { renderNavUser } from '../utils/nav.js'

const PAGE_SIZE = 64

let currentUserId = null
let offset = 0
let hasMore = true
let isLoading = false

async function init() {
  const session = await getSession()
  const user = session ? await getCurrentUser() : null

  const params = new URLSearchParams(window.location.search)
  const profileId = params.get('id')

  // Own profile requires auth
  if (!profileId && !user) {
    window.location.href = '/login.html'
    return
  }

  renderNavUser(document.getElementById('user-email'), user)

  const isOwnProfile = user && (!profileId || profileId === user.id)
  currentUserId = isOwnProfile ? undefined : profileId

  const profile = await getProfile(profileId || undefined)
  const displayName = profile.display_name || profile.email
  const titleEl = document.getElementById('page-title')
  if (titleEl) titleEl.textContent = `${displayName}'s lists`
  document.title = `${displayName}'s lists - Syft`

  if (profile.avatar_url) {
    const avatarEl = document.getElementById('profile-avatar')
    if (avatarEl) {
      avatarEl.src = profile.avatar_url
      avatarEl.classList.remove('hidden')
    }
  }

  await loadLists()
  setupObserver()
  setupScrollHide()

  if (isOwnProfile) {
    setupCreateButtons()
    await initAddItemForm({
      onListCreated: () => resetAndLoad()
    })
  } else {
    document.querySelectorAll('.create-list-btn').forEach(btn => btn.style.display = 'none')
    const settingsBtn = document.getElementById('settings-btn')
    if (settingsBtn) settingsBtn.style.display = 'none'
  }

  document.body.classList.add('ready')
}

async function resetAndLoad() {
  isLoading = true
  offset = 0
  hasMore = true
  document.getElementById('lists-container').innerHTML = ''
  await loadLists()
  isLoading = false
}

async function loadLists() {
  const container = document.getElementById('lists-container')
  const sentinel = document.getElementById('load-more-sentinel')

  try {
    sentinel.classList.remove('hidden')
    const lists = await getLists(currentUserId, { from: offset, to: offset + PAGE_SIZE - 1 })
    offset += lists.length
    if (lists.length < PAGE_SIZE) hasMore = false

    if (offset === lists.length && lists.length === 0) {
      container.innerHTML = `
        <div class="relative group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-between h-full gap-1">
          <p class="sm:text-xl text-lg pt-30 font-medium">Create your first list</p>
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
      return
    }

    container.insertAdjacentHTML('beforeend', lists.map(renderListCard).join(''))

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
            <img src="${url}" alt="" class="w-full h-full object-cover">
          </div>
        `).join('')}
      </div>`
    : ''

  return `
    <a href="/list.html?id=${list.id}" class="group hover:border-gray-300 border border-gray-200 bg-white transition-colors rounded-md p-3 flex flex-col justify-end h-full gap-1">
      <h3 class="wrap-break-word text-pretty sm:text-xl text-lg leading-[23px] pt-24 font-medium text-ellipsis line-clamp-2 hover:underline mb-1">${escapeHtml(list.name)}</h3>
      <div class="flex items-center gap-1 h-8">
        ${previewCircles}
        <p class="sm:text-sm text-xs text-gray-500">${list.list_items[0].count} ${list.list_items[0].count === 1 ? 'item' : 'items'}</p>
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
      btn.classList.remove('w-8', 'h-8', 'hover:bg-white')
      btn.classList.add('h-12', 'px-3', 'bg-white')
      if (expandFull) {
        btn.classList.add('left-3', 'sm:left-auto')
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
        btn.classList.add('w-8', 'h-8')
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
          window.location.href = `/list.html?id=${list.id}`
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
