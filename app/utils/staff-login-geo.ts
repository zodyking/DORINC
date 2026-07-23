import type { StaffLoginGeo } from '#shared/validators/auth'

export type StaffLoginGeoErrorCode
  = | 'GEO_UNAVAILABLE'
    | 'GEO_PERMISSION_DENIED'
    | 'GEO_POSITION_UNAVAILABLE'
    | 'GEO_TIMEOUT'
    | 'GEO_UNKNOWN'

export function staffLoginGeoErrorMessage(code: StaffLoginGeoErrorCode): string {
  switch (code) {
    case 'GEO_UNAVAILABLE':
      return 'This browser does not support location services. Use a device with GPS or enable location in your browser settings.'
    case 'GEO_PERMISSION_DENIED':
      return 'Location access is required to finish signing in. Allow location when prompted, then try again.'
    case 'GEO_POSITION_UNAVAILABLE':
      return 'Could not determine your device location. Check that location services are enabled and try again.'
    case 'GEO_TIMEOUT':
      return 'Location request timed out. Move to an area with better signal and try again.'
    default:
      return 'Could not read your device location. Try again.'
  }
}

export function requestStaffLoginGeo(timeoutMs = 15_000): Promise<StaffLoginGeo> {
  return new Promise((resolve, reject) => {
    if (!import.meta.client || typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('GEO_UNAVAILABLE'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        })
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('GEO_PERMISSION_DENIED'))
            return
          case error.POSITION_UNAVAILABLE:
            reject(new Error('GEO_POSITION_UNAVAILABLE'))
            return
          case error.TIMEOUT:
            reject(new Error('GEO_TIMEOUT'))
            return
          default:
            reject(new Error('GEO_UNKNOWN'))
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      },
    )
  })
}

export function mapStaffLoginGeoError(err: unknown): string {
  const code = (err as Error)?.message as StaffLoginGeoErrorCode
  if (code?.startsWith('GEO_')) return staffLoginGeoErrorMessage(code)
  return staffLoginGeoErrorMessage('GEO_UNKNOWN')
}
