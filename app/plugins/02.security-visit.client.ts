import { collectDeviceSignals } from '~/utils/device-signals'
import {
  consumeOutsideGeoOkQuery,
  hasOutsideGeoTabSession,
} from '~/utils/outside-geo-session'

const BEACON_STORE_KEY = 'dorinc_visit_beacon_at'
/** One security-log entry per path per window — not one per navigation. */
const BEACON_MIN_GAP_MS = 10 * 60 * 1000

function recentlyBeaconed(path: string): boolean {
  try {
    const raw = sessionStorage.getItem(BEACON_STORE_KEY)
    const seen = raw ? JSON.parse(raw) as Record<string, number> : {}
    const last = seen[path]
    const now = Date.now()
    if (typeof last === 'number' && now - last < BEACON_MIN_GAP_MS) return true
    seen[path] = now
    sessionStorage.setItem(BEACON_STORE_KEY, JSON.stringify(seen))
    return false
  }
  catch {
    return false
  }
}

/**
 * Send a visit beacon with device signals so the access gate can log visits.
 * Throttled per path: a beacon (and its database write) on every SPA hop
 * multiplied database load until the connection pool starved.
 * Never redirects — the HTML middleware owns geofence enforcement.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  let inFlight = false

  async function beacon(path: string) {
    if (!import.meta.client) return
    if (!path || path.startsWith('/_nuxt') || path.startsWith('/__nuxt')) return
    consumeOutsideGeoOkQuery(path)
    if (inFlight) return

    const cleanPath = path.split('?')[0] || '/'
    if (recentlyBeaconed(cleanPath)) return

    inFlight = true
    try {
      const signals = await collectDeviceSignals()
      await $fetch('/api/security/visit-beacon', {
        method: 'POST',
        body: {
          path: cleanPath,
          signals,
          outsideGeoSession: hasOutsideGeoTabSession(),
        },
      })
    }
    catch {
      // Best-effort — never break navigation if beacon fails.
    }
    finally {
      inFlight = false
    }
  }

  void beacon(router.currentRoute.value.fullPath || '/')
  router.afterEach((to) => {
    void beacon(to.fullPath || '/')
  })
})
