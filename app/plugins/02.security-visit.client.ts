import { collectDeviceSignals } from '~/utils/device-signals'

/**
 * On every client navigation / first load: send a visit beacon with device
 * signals so the access gate captures SPA visits and can enforce the geofence
 * even when the HTML middleware did not run.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  let lastPath = ''
  let inFlight = false

  async function beacon(path: string) {
    if (!import.meta.client) return
    if (!path || path.startsWith('/_nuxt') || path.startsWith('/__nuxt')) return
    if (path === lastPath && inFlight) return
    lastPath = path
    inFlight = true
    try {
      const signals = await collectDeviceSignals()
      const res = await $fetch<{
        blocked: boolean
        redirectTo: string | null
      }>('/api/security/visit-beacon', {
        method: 'POST',
        body: { path, signals },
      })

      if (res?.blocked && res.redirectTo && res.redirectTo.startsWith('/')) {
        if (router.currentRoute.value.path !== res.redirectTo.split('?')[0]) {
          await navigateTo(res.redirectTo)
        }
      }
    }
    catch {
      // Best-effort — never break navigation if beacon fails.
    }
    finally {
      inFlight = false
    }
  }

  // Initial load + every client navigation (avoid double-firing page:finish + afterEach).
  void beacon(router.currentRoute.value.fullPath || '/')
  router.afterEach((to) => {
    void beacon(to.fullPath || '/')
  })
})
