/* DORINC Suite service worker — offline shell cache (P4-01). */
const CACHE_NAME = 'dorinc-shell-v6'

const SHELL_URLS = ['/', '/auth/login', '/manifest.webmanifest']

function isHashedAsset(pathname) {
  return pathname.startsWith('/_nuxt/')
    || pathname.startsWith('/api/')
    || pathname.endsWith('.mjs')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).catch(() => undefined),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const { pathname } = new URL(event.request.url)
  if (isHashedAsset(pathname)) {
    event.respondWith(fetch(event.request))
    return
  }

  event.respondWith(
    fetch(event.request)
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('/')
          if (fallback) return fallback
        }
        return Response.error()
      }),
  )
})
