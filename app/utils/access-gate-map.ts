/** Shape of an access-gate event as rendered on the security map + table. */
export interface AccessMapEvent {
  id: string
  eventType: 'visit' | 'login'
  outcome: string
  ipAddress: string | null
  userName: string | null
  userEmail: string | null
  path: string | null
  userAgent: string | null
  deviceId: string | null
  os: string | null
  deviceType: string | null
  screenResolution: string | null
  devicePixelRatio: number | null
  cpuCores: number | null
  deviceMemoryGb: number | null
  gpuRenderer: string | null
  canvasFingerprint: string | null
  webglFingerprint: string | null
  audioFingerprint: string | null
  timezone: string | null
  language: string | null
  maxTouchPoints: number | null
  latitude: number | null
  longitude: number | null
  locationLabel: string | null
  country: string | null
  createdAt: string
}

/** Shorten long fingerprint hashes for table cells. */
export function shortFingerprint(value: string | null | undefined, keep = 10): string {
  if (!value) return '—'
  if (value.length <= keep + 1) return value
  return `${value.slice(0, keep)}…`
}

export function accessEventWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  }
  catch {
    return iso
  }
}
