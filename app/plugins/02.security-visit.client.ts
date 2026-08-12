import { collectDeviceSignals } from '~/utils/device-signals'
import {
  consumeOutsideGeoOkQuery,
  hasOutsideGeoTabSession,
} from '~/utils/outside-geo-session'

/**
 * On every client navigation / first load: send a visit beacon with device
 * signals so the access gate can log SPA visits. Does not redirect — the
 * HTML document middleware owns geofence enforcement for full page loads.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  let lastPath = ''
  let inFlight = false

  async function beacon(path: string) {
    if (!import.meta.client) return
    if (!path || path.startsWith('/_nuxt') || path.startsWith('/__nuxt')) return
    consumeOutsideGeoOkQuery(path)
    if (path === lastPath && inFlight) return
    lastPath = path
    inFlight = true
    try {
      const signals = await collectDeviceSignals()
      await $fetch('/api/security/visit-beacon', {
        method: 'POST',
        body: {
          path: path.split('?')[0] || '/',
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

  // Initial load + every client navigation.
  void beacon(router.currentRoute.value.fullPath || '/')
  router.afterEach((to) => {
    void beacon(to.fullPath || '/')
  })
})
