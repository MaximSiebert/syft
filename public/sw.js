const CACHE = 'syft-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put('/', copy))
      return response
    }).catch(() => caches.match('/'))
  )
})
