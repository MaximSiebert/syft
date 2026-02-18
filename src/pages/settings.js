import { signOut, deleteAccount, getCurrentUser } from '../lib/auth.js'
import { getProfile, updateProfile, migrateAvatarIfNeeded } from '../lib/db.js'
import { requireAuth } from '../utils/guards.js'
import { showToast, inlineConfirm } from '../utils/ui.js'

async function init() {
  const session = await requireAuth()
  if (!session) return

  const user = await getCurrentUser()
  const avatarEl = document.getElementById('user-avatar')
  const avatarUrl = user.user_metadata?.avatar_url
  if (avatarUrl) {
    avatarEl.innerHTML = `<a href="/profile.html" class="ml-1 block w-10 h-10 flex items-center justify-center hover:bg-white block rounded-full hover:border-gray-300 border-gray-200 border"><img src="${avatarUrl}" alt="" class="w-8 h-8 rounded-full"></a>`
  } else {
    avatarEl.innerHTML = `<a href="/profile.html" class="text-sm hover:border-gray-300 border border-gray-200 bg-gray-50 hover:bg-white transition-colors px-3 h-10 flex items-center text-center rounded-md">${user.email}</a>`
  }

  let currentName = ''
  try {
    const profile = await getProfile()
    document.getElementById('user-email').textContent = profile.email
    currentName = profile.display_name || ''

    // Update nav avatar to use profile URL (Storage) and cache the best URL
    if (profile.avatar_url) {
      avatarEl.innerHTML = `<a href="/profile.html" class="ml-1 block w-10 h-10 flex items-center justify-center hover:bg-white block rounded-full hover:border-gray-300 border-gray-200 border"><img src="${profile.avatar_url}" alt="" class="w-8 h-8 rounded-full"></a>`
    }
    try { localStorage.setItem('syft_nav_avatar', profile.avatar_url || avatarUrl) } catch {}

    // Lazily migrate external avatar to Supabase Storage
    if (profile.avatar_url && !profile.avatar_url.includes('/storage/v1/object/public/')) {
      migrateAvatarIfNeeded(profile.id, profile.avatar_url).catch(() => {})
    }
    const nameEl = document.getElementById('user-name')
    nameEl.textContent = currentName || 'Not set'

    nameEl.addEventListener('focus', () => {
      if (!currentName) nameEl.textContent = ''
    })

    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        nameEl.blur()
      }
      if (e.key === 'Escape') {
        nameEl.textContent = currentName || 'Not set'
        nameEl.blur()
      }
    })

    nameEl.addEventListener('blur', async () => {
      const newName = nameEl.textContent.trim()
      if (!newName || newName === 'Not set') {
        nameEl.textContent = currentName || 'Not set'
        return
      }
      if (newName === currentName) return

      try {
        const updated = await updateProfile({ display_name: newName })
        currentName = updated.display_name
        nameEl.textContent = currentName
        showToast('Name updated', 'success')
      } catch (error) {
        nameEl.textContent = currentName || 'Not set'
        showToast(error.message, 'error')
      }
    })
  } catch (error) {
    console.error('Failed to load profile:', error)
  }

  // Appearance
  const appearanceSelect = document.getElementById('appearance-select')
  const savedTheme = localStorage.getItem('syft_theme') || 'system'
  appearanceSelect.value = savedTheme

  appearanceSelect.addEventListener('change', () => {
    const value = appearanceSelect.value
    if (value === 'system') {
      localStorage.removeItem('syft_theme')
    } else {
      localStorage.setItem('syft_theme', value)
    }
    const isDark = value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme:dark)').matches)
    document.documentElement.classList.toggle('dark', isDark)
    // Update theme-color meta tags
    const metas = document.querySelectorAll('meta[name="theme-color"]')
    const color = isDark ? '#111113' : '#f9fafb'
    metas.forEach(m => m.setAttribute('content', color))
  })

  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    try {
      await signOut()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  // Strip formatting on paste in any contenteditable field
  document.addEventListener('paste', (e) => {
    const el = e.target.closest('[contenteditable="true"]')
    if (!el) return
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  })

  document.getElementById('delete-account-btn')?.addEventListener('click', async (e) => {
    if (!inlineConfirm(e.currentTarget)) return

    try {
      await deleteAccount()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })
}

init()
