interface CheckResponse {
  blocked: boolean
  reason: string | null
  redirectUrl: string | null
  message: string
  needsDeviceLocation: boolean
}

interface CheckRequest {
  path: string
  device: { latitude: number, longitude: number, accuracyM: number | null } | null
  timezone: string | null
  screen: string | null
}

/** Client-side floor on how often a navigation re-runs the check. */
const RECHECK_INTERVAL_MS = 60_000
const EXEMPT_PATHS = ['/access-denied', '/setup']

/**
 * Read the device position, but only when the browser has already granted
 * location access. Site load must never trigger a permission prompt — staff
 * sign-in is where we ask for that explicitly.
 */
async function readGrantedPosition(): Promise<CheckRequest['device']> {
  if (!navigator.geolocation || !navigator.permissions?.query) return null
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (status.state !== 'granted') return null
  }
  catch {
    return null
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
      }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  })
}

function applyDecision(result: CheckResponse): void {
  if (!result.blocked) return
  const target = result.redirectUrl
    || `/access-denied?reason=${encodeURIComponent(result.reason ?? 'blocked')}`
  if (window.location.pathname === target || window.location.href === target) return
  window.location.href = target
}

export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return

  let worker: Worker | null = null
  let lastRunAt = 0
  let disabled = false

  const send = (payload: CheckRequest) => {
    if (worker) {
      worker.postMessage(payload)
      return
    }
    // No Worker support (or it failed to start): fall back to the main thread.
    void $fetch<CheckResponse>('/api/security/check', { method: 'POST', body: payload })
      .then(applyDecision)
      .catch(() => {})
  }

  const run = async (path: string) => {
    if (disabled) return
    if (EXEMPT_PATHS.some(prefix => path.startsWith(prefix))) return
    const now = Date.now()
    if (now - lastRunAt < RECHECK_INTERVAL_MS) return
    lastRunAt = now

    send({
      path,
      device: await readGrantedPosition(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    })
  }

  try {
    worker = new Worker(new URL('../workers/security-check.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.addEventListener('message', (event: MessageEvent<{ type: string, result?: CheckResponse }>) => {
      if (event.data?.type === 'result' && event.data.result) applyDecision(event.data.result)
    })
    worker.addEventListener('error', () => {
      worker?.terminate()
      worker = null
    })
  }
  catch {
    worker = null
  }

  const nuxtApp = useNuxtApp()
  nuxtApp.hook('app:mounted', () => {
    void run(window.location.pathname)
  })

  useRouter().afterEach((to) => {
    void run(to.path)
  })

  // Stop re-checking once the tab is torn down.
  window.addEventListener('pagehide', () => {
    disabled = true
    worker?.terminate()
    worker = null
  }, { once: true })
})
