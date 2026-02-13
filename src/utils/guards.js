import { getSession } from '../lib/auth.js'

export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    window.location.href = '/login.html'
    return null
  }
  return session
}

export async function redirectIfAuthed(redirectTo = '/') {
  const session = await getSession()
  if (session) {
    window.location.href = redirectTo
    return true
  }
  return false
}
