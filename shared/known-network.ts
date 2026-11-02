/**
 * Network fingerprints used at sign-in.
 * IPv4 /24 and IPv6 /64 treat DHCP/CGNAT churn on the same LAN as one network.
 */

export function networkKeyFromIp(ip: string | null | undefined): string | null {
  const cleaned = String(ip ?? '').trim()
  if (!cleaned) return null

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(cleaned)) {
    const parts = cleaned.split('.').map(part => Number(part))
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
      return null
    }
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
  }

  if (cleaned.includes(':')) {
    const expanded = expandIpv6(cleaned)
    if (!expanded) return null
    const groups = expanded.split(':')
    return `${groups.slice(0, 4).join(':')}::/64`
  }

  return null
}

export function ipsShareNetwork(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = networkKeyFromIp(left)
  const b = networkKeyFromIp(right)
  return Boolean(a && b && a === b)
}

/** Compact label for My Account (203.0.113.x, 2001:db8:1:2::/64). */
export function formatNetworkLabel(key: string | null | undefined): string {
  const value = String(key ?? '').trim()
  if (!value) return 'Unknown network'
  const v4 = value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.0\/24$/)
  if (v4) return `${v4[1]}.x`
  return value
}

function expandIpv6(ip: string): string | null {
  let cleaned = ip.trim().toLowerCase()
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1)
  }
  if (cleaned.includes('%')) cleaned = cleaned.slice(0, cleaned.indexOf('%'))
  if (!cleaned.includes(':')) return null

  const [head, tail] = cleaned.split('::')
  const headParts = head ? head.split(':').filter(Boolean) : []
  const tailParts = tail ? tail.split(':').filter(Boolean) : []
  if (cleaned.includes('::')) {
    const missing = 8 - headParts.length - tailParts.length
    if (missing < 0) return null
    const filled = [...headParts, ...Array.from({ length: missing }, () => '0'), ...tailParts]
    if (filled.length !== 8) return null
    return filled.map(normalizeIpv6Group).join(':')
  }

  const parts = cleaned.split(':')
  if (parts.length !== 8) return null
  return parts.map(normalizeIpv6Group).join(':')
}

function normalizeIpv6Group(group: string): string {
  const hex = group.replace(/^0+/, '') || '0'
  return hex
}
