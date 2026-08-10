import {
  OUTSIDE_GEO_OK_QUERY,
  OUTSIDE_GEO_SESSION_STORAGE_KEY,
  isOutsideGeoSessionFlag,
} from '#shared/outside-geo-session'

/** Mark this browser tab as verified for outside-geofence browsing. */
export function markOutsideGeoTabSession(): void {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(OUTSIDE_GEO_SESSION_STORAGE_KEY, '1')
  }
  catch {
    // private mode
  }
}

export function clearOutsideGeoTabSession(): void {
  if (!import.meta.client) return
  try {
    sessionStorage.removeItem(OUTSIDE_GEO_SESSION_STORAGE_KEY)
  }
  catch {
    // ignore
  }
}

export function hasOutsideGeoTabSession(): boolean {
  if (!import.meta.client) return false
  try {
    return isOutsideGeoSessionFlag(sessionStorage.getItem(OUTSIDE_GEO_SESSION_STORAGE_KEY))
  }
  catch {
    return false
  }
}

/** If the URL carries geo_ok=1 after verify, persist tab session and clean the query. */
export function consumeOutsideGeoOkQuery(pathWithQuery: string): boolean {
  if (!import.meta.client) return false
  try {
    const url = new URL(pathWithQuery, window.location.origin)
    if (!isOutsideGeoSessionFlag(url.searchParams.get(OUTSIDE_GEO_OK_QUERY))) return false
    markOutsideGeoTabSession()
    url.searchParams.delete(OUTSIDE_GEO_OK_QUERY)
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState(window.history.state, '', next)
    return true
  }
  catch {
    return false
  }
}
