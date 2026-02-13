import { supabase } from '../lib/supabase.js'

const userIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.8 -0.8 16 16" id="User-Single--Streamline-Micro" height="12" width="12">
  <desc>
    User Single Streamline Icon: https://streamlinehq.com
  </desc>
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M7.200000000000001 6.48a2.8800000000000003 2.8800000000000003 0 1 0 0 -5.760000000000001 2.8800000000000003 2.8800000000000003 0 0 0 0 5.760000000000001Z" stroke-width="1.6"></path>
  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M13.31136 13.680000000000001a6.48 6.48 0 0 0 -12.22272 0h12.22272Z" stroke-width="1.6"></path>
</svg>`

function setAvatar(el, avatarUrl) {
  el.innerHTML = `<a href="/profile.html" class="ml-1 block w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-white block rounded-full hover:border-gray-300 border-gray-200 border"><img src="${avatarUrl}" alt="" class="w-8 h-8 rounded-full"></a>`
}

export function renderNavUser(el, user) {
  if (user) {
    const oauthAvatar = user.user_metadata?.avatar_url
    if (oauthAvatar) setAvatar(el, oauthAvatar)
    else {
      el.innerHTML = `<a href="/profile.html" class="text-sm hover:border-gray-300 border border-gray-200 bg-gray-50 hover:bg-white transition-colors w-10 h-10 flex items-center justify-center rounded-full">${userIconSvg}</a>`
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
    el.innerHTML = `<a href="/login.html" class="text-sm text-gray-50 bg-orange-500 hover:bg-orange-600 transition-colors h-8 w-8 flex items-center justify-center rounded-full">${userIconSvg}</a>`
  }
}
