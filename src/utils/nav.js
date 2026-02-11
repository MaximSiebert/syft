import { supabase } from '../lib/supabase.js'

const userIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.8 -0.8 16 16" height="16" width="16">
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M7.200000000000001 7.532640000000001a2.16 2.16 0 1 0 0 -4.32 2.16 2.16 0 0 0 0 4.32Z" stroke-width="1.6"></path>
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M2.9419200000000005 12.084480000000001a4.986720000000001 4.986720000000001 0 0 1 8.516160000000001 0" stroke-width="1.6"></path>
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M7.200000000000001 13.680000000000001a6.48 6.48 0 1 0 0 -12.96 6.48 6.48 0 0 0 0 12.96Z" stroke-width="1.6"></path>
</svg>`

function setAvatar(el, avatarUrl) {
  el.innerHTML = `<a href="/profile.html" class="ml-1 block w-10 h-10 flex items-center justify-center hover:bg-white block rounded-full hover:border-gray-300 border-gray-200 border"><img src="${avatarUrl}" alt="" class="w-8 h-8 rounded-full"></a>`
}

export function renderNavUser(el, user) {
  if (user) {
    const oauthAvatar = user.user_metadata?.avatar_url
    if (oauthAvatar) setAvatar(el, oauthAvatar)
    else {
      el.innerHTML = `<a href="/profile.html" class="text-sm hover:border-gray-300 border border-gray-200 bg-gray-50 hover:bg-white transition-colors px-3 h-10 flex items-center text-center rounded-md">${userIconSvg}</a>`
    }

    // Swap to Storage URL from profile if available
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatar(el, data.avatar_url)
      })
      .catch(() => {})
  } else {
    el.innerHTML = `<a href="/login.html" class="text-sm hover:border-gray-300 border border-gray-200 bg-gray-50 hover:bg-white transition-colors px-3 h-10 flex items-center text-center rounded-md">${userIconSvg}</a>`
  }
}
