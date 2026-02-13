const CACHE = 'syft-v2'
const PRECACHE = ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  )
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
  // Always go to network, fall back to cache for navigation
  event.respondWith(
    fetch(event.request).catch(() =>
      event.request.mode === 'navigate'
        ? caches.match('/')
        : Response.error()
    )
  )
})
