const CACHE = 'syft-v1'
const PRECACHE = ['/explore.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Always go to network, fall back to cache for navigation
  event.respondWith(
    fetch(event.request).catch(() =>
      event.request.mode === 'navigate'
        ? caches.match('/explore.html')
        : Response.error()
    )
  )
})
