/**
 * Runs the site-load access check off the main thread.
 *
 * The server side of this call performs an IP geolocation lookup, which can
 * take a second or more on a cold cache. Doing it in a worker keeps that
 * entirely off the critical rendering path — the page paints normally and is
 * only redirected if the check comes back blocked.
 */

interface CheckRequest {
  path: string
  device: { latitude: number, longitude: number, accuracyM: number | null } | null
  timezone: string | null
  screen: string | null
}

interface CheckResponse {
  blocked: boolean
  reason: string | null
  redirectUrl: string | null
  message: string
  needsDeviceLocation: boolean
}

type WorkerOutbound
  = | { type: 'result', result: CheckResponse }
    | { type: 'error', message: string }

const REQUEST_TIMEOUT_MS = 12_000

async function runCheck(payload: CheckRequest): Promise<CheckResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/security/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      signal: controller.signal,
    })
    if (!res.ok) {
      // A 403 here means the middleware already denied us; treat it as blocked
      // so the page does not sit on content it should not be showing.
      if (res.status === 403) {
        return {
          blocked: true,
          reason: 'ip_banned',
          redirectUrl: null,
          message: 'Access to this site is restricted from your location.',
          needsDeviceLocation: false,
        }
      }
      throw new Error(`check failed with status ${res.status}`)
    }
    return await res.json() as CheckResponse
  }
  finally {
    clearTimeout(timeout)
  }
}

self.addEventListener('message', (event: MessageEvent<CheckRequest>) => {
  const payload = event.data
  runCheck(payload)
    .then((result) => {
      ;(self as unknown as Worker).postMessage({ type: 'result', result } satisfies WorkerOutbound)
    })
    .catch((err: unknown) => {
      // Failing open is deliberate: a network hiccup must never lock users out.
      ;(self as unknown as Worker).postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'security check failed',
      } satisfies WorkerOutbound)
    })
})

export {}
