import { signOut, deleteAccount, getCurrentUser } from '../lib/auth.js'
import { getProfile, updateProfile } from '../lib/db.js'
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

  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    try {
      await signOut()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  document.getElementById('delete-account-btn')?.addEventListener('click', async (e) => {
    if (!inlineConfirm(e.currentTarget)) return

    try {
      await deleteAccount()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  document.body.classList.add('ready')
}

init()
