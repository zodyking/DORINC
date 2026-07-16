// My account page helpers (mockup: PAGE: MY ACCOUNT / P1-35).

const MIN_PASSWORD_LENGTH = 12

export function validateNewPassword(password: string): string | null {
  if (!password) return 'Enter a new password'
  if (password.length < MIN_PASSWORD_LENGTH) return `Minimum ${MIN_PASSWORD_LENGTH} characters`
  return null
}

export function sessionDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'
  const ua = userAgent.toLowerCase()
  const os = ua.includes('iphone') || ua.includes('ipad')
    ? 'iPhone'
    : ua.includes('android')
      ? 'Android'
      : ua.includes('mac')
        ? 'macOS'
        : ua.includes('windows')
          ? 'Windows'
          : ua.includes('linux')
            ? 'Linux'
            : 'Device'
  const browser = ua.includes('chrome') && !ua.includes('edg')
    ? 'Chrome'
    : ua.includes('firefox')
      ? 'Firefox'
      : ua.includes('safari') && !ua.includes('chrome')
        ? 'Safari'
        : ua.includes('edg')
          ? 'Edge'
          : 'Browser'
  return `${os} · ${browser}`
}

export function sessionLocation(
  locationLabel: string | null | undefined,
  isCurrent: boolean,
): string {
  const base = locationLabel?.trim() || '—'
  return isCurrent ? `${base} · this device` : base
}

export function formatMemberSince(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function formatLastLogin(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `Today ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatSessionAge(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  if (diffMs < 60_000) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
