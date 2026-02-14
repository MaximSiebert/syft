import { supabase } from './supabase.js'

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })
  if (error) throw error
  return data
}

export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) throw error
  return data
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  try { localStorage.removeItem('syft_nav_avatar') } catch {}
  window.location.href = '/'
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export function getSessionUserIdSync() {
  const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k))
  if (!key) return null
  try {
    const s = JSON.parse(localStorage.getItem(key))
    return s?.user?.id || null
  } catch { return null }
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}

export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_user_account')
  if (error) throw error
  await supabase.auth.signOut()
  window.location.href = '/'
}
