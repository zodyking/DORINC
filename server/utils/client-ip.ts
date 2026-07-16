import type { H3Event } from 'h3'
import { getHeader, getRequestIP } from 'h3'

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
]

/** Common CDN / reverse-proxy IPv4 ranges (Cloudflare, etc.). */
const KNOWN_PROXY_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
]

const CLIENT_IP_HEADERS = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
] as const

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip))
}

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part) || part < 0 || part > 255)) {
    return null
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

export function isKnownProxyIp(ip: string): boolean {
  const normalized = normalizeClientIp(ip)
  if (!normalized || !/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return false
  const ipLong = ipv4ToLong(normalized)
  if (ipLong === null) return false

  return KNOWN_PROXY_CIDRS.some((cidr) => {
    const [range, bitsStr] = cidr.split('/')
    const bits = Number(bitsStr)
    const rangeLong = ipv4ToLong(range!)
    if (rangeLong === null) return false
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (ipLong & mask) === (rangeLong & mask)
  })
}

/** Normalize forwarded / IPv6-mapped client IPs before lookup. */
export function normalizeClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  let cleaned = ip.trim()
  if (!cleaned) return null

  if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0]?.trim() ?? ''
  }

  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.slice('::ffff:'.length)
  }

  if (/^\[.+\](:\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/^\[(.+)\](?::\d+)?$/, '$1')
  }
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(cleaned)) {
    cleaned = cleaned.split(':')[0] ?? cleaned
  }

  return cleaned || null
}

function isUsableClientIp(ip: string | null | undefined): ip is string {
  if (!ip) return false
  if (isPrivateIp(ip)) return false
  if (isKnownProxyIp(ip)) return false
  return true
}

function headerValue(event: H3Event, name: string): string | null {
  const value = getHeader(event, name)?.trim()
  return value || null
}

function extractFromForwardedHeader(value: string): string | null {
  const match = value.match(/for=(?:"\[([^"]+)\]"|([^;,\s"]+))/i)
  if (!match) return null
  return normalizeClientIp(match[1] || match[2])
}

/** Parse X-Forwarded-For and return the leftmost public, non-proxy client IP. */
export function extractClientIpFromForwarded(forwarded: string): string | null {
  const candidates = forwarded
    .split(',')
    .map(part => normalizeClientIp(part))
    .filter((part): part is string => Boolean(part))

  for (const candidate of candidates) {
    if (isUsableClientIp(candidate)) return candidate
  }

  return candidates[0] ?? null
}

/**
 * Resolve the visitor's public IP from proxy headers before falling back to the socket peer.
 * Prioritizes Cloudflare / CDN headers that carry the original client address.
 */
export function getClientIp(event: H3Event): string | null {
  for (const header of CLIENT_IP_HEADERS) {
    const candidate = normalizeClientIp(headerValue(event, header))
    if (isUsableClientIp(candidate)) return candidate
  }

  const forwarded = headerValue(event, 'forwarded')
  if (forwarded) {
    const candidate = extractFromForwardedHeader(forwarded)
    if (isUsableClientIp(candidate)) return candidate
  }

  const xForwardedFor = headerValue(event, 'x-forwarded-for')
  if (xForwardedFor) {
    const candidate = extractClientIpFromForwarded(xForwardedFor)
    if (isUsableClientIp(candidate)) return candidate
  }

  const h3Forwarded = normalizeClientIp(getRequestIP(event, { xForwardedFor: true }))
  if (isUsableClientIp(h3Forwarded)) return h3Forwarded

  const socketIp = normalizeClientIp(getRequestIP(event))
  if (isUsableClientIp(socketIp)) return socketIp

  return h3Forwarded || socketIp || null
}
