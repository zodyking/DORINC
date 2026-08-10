/** Tab-scoped outside-geofence session (sessionStorage — not shared across tabs). */

export const OUTSIDE_GEO_SESSION_STORAGE_KEY = 'dorinc_outside_geo_session'
export const OUTSIDE_GEO_SESSION_HEADER = 'x-outside-geo-session'
export const OUTSIDE_GEO_OK_QUERY = 'geo_ok'

/** True when the client confirmed this browser tab completed verification. */
export function isOutsideGeoSessionFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value !== 'string') return false
  const v = value.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}
