/**
 * IPv4/IPv6 address and CIDR matching used by the IP ban list.
 *
 * Rules are normalized to an inclusive numeric range so a single ban row can
 * cover one address or a whole prefix, and so matching never depends on string
 * formatting (`::ffff:1.2.3.4`, `1.2.3.4:5678`, uppercase IPv6, …).
 */

export type IpFamily = 4 | 6

export interface ParsedIp {
  family: IpFamily
  value: bigint
  /** Lower-case, fully expanded-then-compressed canonical form. */
  canonical: string
}

export interface IpRule {
  family: IpFamily
  /** Single address when prefix covers every bit, otherwise a range. */
  kind: 'single' | 'range'
  prefix: number
  start: bigint
  end: bigint
  /** `1.2.3.4` or `1.2.3.0/24` — the value stored and displayed. */
  canonical: string
}

const IPV4_BITS = 32
const IPV6_BITS = 128
const IPV4_MAPPED_PREFIX = 0xffffn << 32n

/** Strip ports, brackets, zone ids, and IPv4-mapped IPv6 wrappers. */
export function cleanIpInput(input: string | null | undefined): string | null {
  if (input == null) return null
  let value = String(input).trim()
  if (!value) return null

  if (value.includes(',')) value = value.split(',')[0]!.trim()

  // [2001:db8::1]:443 → 2001:db8::1
  const bracketed = value.match(/^\[(.+?)\](?::\d+)?$/)
  if (bracketed) value = bracketed[1]!

  // 1.2.3.4:443 → 1.2.3.4 (IPv6 has multiple colons, so this is unambiguous)
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.split(':')[0]!

  // fe80::1%eth0 → fe80::1
  const zone = value.indexOf('%')
  if (zone !== -1) value = value.slice(0, zone)

  value = value.toLowerCase()
  if (value.startsWith('::ffff:') && value.includes('.')) value = value.slice('::ffff:'.length)

  return value || null
}

function parseIpv4(value: string): bigint | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  let out = 0n
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const num = Number(part)
    if (num > 255) return null
    out = (out << 8n) | BigInt(num)
  }
  return out
}

function parseIpv6(value: string): bigint | null {
  const halves = value.split('::')
  if (halves.length > 2) return null

  const expand = (chunk: string): string[] => (chunk ? chunk.split(':') : [])
  const head = expand(halves[0] ?? '')
  const tail = halves.length === 2 ? expand(halves[1] ?? '') : []

  // A trailing IPv4 literal (::ffff:1.2.3.4) counts as two groups.
  const groups: string[] = []
  const pushGroups = (source: string[], target: string[]) => {
    for (const group of source) {
      if (group.includes('.')) {
        const v4 = parseIpv4(group)
        if (v4 === null) return false
        target.push((v4 >> 16n).toString(16), (v4 & 0xffffn).toString(16))
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(group)) return false
      target.push(group)
    }
    return true
  }

  const headGroups: string[] = []
  const tailGroups: string[] = []
  if (!pushGroups(head, headGroups)) return null
  if (!pushGroups(tail, tailGroups)) return null

  if (halves.length === 2) {
    const fill = 8 - headGroups.length - tailGroups.length
    if (fill < 1) return null
    groups.push(...headGroups, ...Array.from({ length: fill }, () => '0'), ...tailGroups)
  }
  else {
    groups.push(...headGroups)
  }

  if (groups.length !== 8) return null

  let out = 0n
  for (const group of groups) out = (out << 16n) | BigInt(Number.parseInt(group, 16))
  return out
}

function formatIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map(shift => Number((value >> shift) & 0xffn)).join('.')
}

function formatIpv6(value: bigint): string {
  const groups: string[] = []
  for (let i = 7n; i >= 0n; i--) groups.push(Number((value >> (i * 16n)) & 0xffffn).toString(16))

  // RFC 5952: compress the longest run of zero groups (2+ groups only).
  let bestStart = -1
  let bestLength = 0
  let runStart = -1
  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && groups[i] === '0') {
      if (runStart === -1) runStart = i
      continue
    }
    if (runStart !== -1) {
      const length = i - runStart
      if (length > bestLength) {
        bestLength = length
        bestStart = runStart
      }
      runStart = -1
    }
  }

  if (bestLength < 2) return groups.join(':')
  const head = groups.slice(0, bestStart).join(':')
  const tail = groups.slice(bestStart + bestLength).join(':')
  return `${head}::${tail}`
}

/** Parse a bare address (no prefix). Returns null when the input is not an IP. */
export function parseIp(input: string | null | undefined): ParsedIp | null {
  const cleaned = cleanIpInput(input)
  if (!cleaned) return null

  if (cleaned.includes(':')) {
    const value = parseIpv6(cleaned)
    if (value === null) return null
    // Treat IPv4-mapped addresses as IPv4 so a v4 ban matches a v4-mapped peer.
    if ((value >> 32n) === IPV4_MAPPED_PREFIX) {
      const v4 = value & 0xffffffffn
      return { family: 4, value: v4, canonical: formatIpv4(v4) }
    }
    return { family: 6, value, canonical: formatIpv6(value) }
  }

  const value = parseIpv4(cleaned)
  if (value === null) return null
  return { family: 4, value, canonical: formatIpv4(value) }
}

/**
 * Parse `1.2.3.4`, `1.2.3.0/24`, or `2001:db8::/32` into an inclusive range.
 * Host bits outside the prefix are zeroed so `1.2.3.4/24` normalizes to
 * `1.2.3.0/24` instead of silently never matching.
 */
export function parseIpRule(input: string | null | undefined): IpRule | null {
  const raw = input == null ? '' : String(input).trim()
  if (!raw) return null

  const slash = raw.lastIndexOf('/')
  const addressPart = slash === -1 ? raw : raw.slice(0, slash)
  const prefixPart = slash === -1 ? null : raw.slice(slash + 1).trim()

  const parsed = parseIp(addressPart)
  if (!parsed) return null

  const bits = parsed.family === 4 ? IPV4_BITS : IPV6_BITS
  let prefix = bits
  if (prefixPart !== null) {
    if (!/^\d{1,3}$/.test(prefixPart)) return null
    prefix = Number(prefixPart)
    if (prefix > bits) return null
  }

  const hostBits = BigInt(bits - prefix)
  const mask = hostBits === 0n ? -1n : ~((1n << hostBits) - 1n)
  const start = parsed.value & mask
  const end = start | ((1n << hostBits) - 1n)
  const base = parsed.family === 4 ? formatIpv4(start) : formatIpv6(start)

  return {
    family: parsed.family,
    kind: prefix === bits ? 'single' : 'range',
    prefix,
    start,
    end,
    canonical: prefix === bits ? base : `${base}/${prefix}`,
  }
}

/** Canonical storage form for a ban entry, or null when unparseable. */
export function normalizeIpRule(input: string | null | undefined): string | null {
  return parseIpRule(input)?.canonical ?? null
}

export function ipMatchesRule(ip: string | null | undefined, rule: IpRule): boolean {
  const parsed = parseIp(ip)
  if (!parsed || parsed.family !== rule.family) return false
  return parsed.value >= rule.start && parsed.value <= rule.end
}

/** Number of addresses a rule covers, for admin-facing "blast radius" display. */
export function ipRuleSize(rule: IpRule): bigint {
  return rule.end - rule.start + 1n
}
