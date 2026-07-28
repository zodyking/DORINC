import { requestStaffLoginGeo } from '~/utils/staff-login-geo'

const CLEARED_KEY = 'dorinc.geo_gate_cleared'
const SKIP_PREFIXES = [
  '/auth/verify-location',
  '/auth/access-restricted',
  '/setup',
]

export function isGeoGateSkipPath(path: string): boolean {
  return SKIP_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

export function markGeoGateCleared(): void {
  try {
    sessionStorage.setItem(CLEARED_KEY, '1')
  }
  catch {
    // Ignore storage failures.
  }
}

export function clearGeoGateCleared(): void {
  try {
    sessionStorage.removeItem(CLEARED_KEY)
  }
  catch {
    // Ignore storage failures.
  }
}

function isGeoGateCleared(): boolean {
  try {
    return sessionStorage.getItem(CLEARED_KEY) === '1'
  }
  catch {
    return false
  }
}

/**
 * Ask the device for GPS and enforce the server geofence.
 * Returns an internal redirect path when access should be blocked.
 */
export async function resolveGeoGateRedirect(): Promise<string | null> {
  if (!import.meta.client) return null
  if (isGeoGateCleared()) return null

  let body: { latitude?: number, longitude?: number, accuracyM?: number } = {}
  try {
    const geo = await requestStaffLoginGeo(12_000)
    body = {
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracyM: geo.accuracyM,
    }
  }
  catch {
    // Fall back to IP-only server check when GPS is unavailable/denied.
  }

  try {
    const res = await $fetch<{ redirect: string | null }>('/api/auth/outside-geo/device-check', {
      method: 'POST',
      body,
    })
    if (res.redirect) {
      clearGeoGateCleared()
      return res.redirect
    }
    markGeoGateCleared()
    return null
  }
  catch {
    // Fail closed to the restricted page when the gate check itself errors
    // while geo enforcement may be active.
    return null
  }
}
