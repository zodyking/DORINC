import { isGeoGateSkipPath, resolveGeoGateRedirect } from '~/utils/geo-gate'

/**
 * Client-side geofence enforcement using device GPS.
 * Server middleware only sees IP location, which is often wrong near city
 * borders — this closes that gap for auth/entry routes.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (isGeoGateSkipPath(to.path)) return

  // Enforce on public entry points where IP-geo most often falsely allows access.
  const needsCheck = to.path === '/'
    || to.path.startsWith('/auth/')
  if (!needsCheck) return

  const redirect = await resolveGeoGateRedirect()
  if (redirect && redirect !== to.fullPath) {
    return navigateTo(redirect, { replace: true })
  }
})
