/* DORINC Suite service worker — shell cache + offline queue stub (P4-01). */
const CACHE_NAME = 'dorinc-shell-v1'
const OFFLINE_QUEUE_KEY = 'dorinc-offline-queue'

const SHELL_URLS = ['/', '/auth/login', '/manifest.webmanifest']

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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'QUEUE_OFFLINE_ACTION') {
    event.waitUntil(enqueueOfflineAction(event.data.payload))
  }
  if (event.data?.type === 'GET_OFFLINE_QUEUE') {
    event.waitUntil(
      readOfflineQueue().then(items => {
        event.source?.postMessage({ type: 'OFFLINE_QUEUE', items })
      }),
    )
  }
})

async function readOfflineQueue() {
  const cache = await caches.open(CACHE_NAME)
  const res = await cache.match(OFFLINE_QUEUE_KEY)
  if (!res) return []
  try {
    return await res.json()
  }
  catch {
    return []
  }
}

async function enqueueOfflineAction(payload) {
  const items = await readOfflineQueue()
  items.push({ ...payload, queuedAt: new Date().toISOString() })
  const cache = await caches.open(CACHE_NAME)
  await cache.put(
    OFFLINE_QUEUE_KEY,
    new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } }),
  )
}
