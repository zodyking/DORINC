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

/** Local calendar day as YYYY-MM-DD. */
export function accessGateDayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseAccessGateDayKey(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim())
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
  return Number.isFinite(dt.getTime()) ? dt : null
}

/** Shift a YYYY-MM-DD key by whole days in local time. */
export function shiftAccessGateDayKey(day: string, deltaDays: number): string {
  const base = parseAccessGateDayKey(day) ?? new Date()
  base.setDate(base.getDate() + deltaDays)
  return accessGateDayKey(base)
}

export function formatAccessGateDayLabel(day: string): string {
  const dt = parseAccessGateDayKey(day)
  if (!dt) return day
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Inclusive local-day bounds as ISO strings for the events API. */
export function accessGateDayBounds(day: string): { from: string, to: string } | null {
  const start = parseAccessGateDayKey(day)
  if (!start) return null
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}
