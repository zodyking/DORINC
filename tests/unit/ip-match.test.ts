import { describe, expect, it } from 'vitest'
import {
  cleanIpInput,
  ipMatchesRule,
  ipRuleSize,
  normalizeIpRule,
  parseIp,
  parseIpRule,
} from '../../shared/net/ip-match'

function rule(input: string) {
  const parsed = parseIpRule(input)
  if (!parsed) throw new Error(`expected ${input} to parse`)
  return parsed
}

describe('cleanIpInput', () => {
  it('strips ports, brackets, and zone ids', () => {
    expect(cleanIpInput('1.2.3.4:8080')).toBe('1.2.3.4')
    expect(cleanIpInput('[2001:db8::1]:443')).toBe('2001:db8::1')
    expect(cleanIpInput('fe80::1%eth0')).toBe('fe80::1')
  })

  it('takes the first hop of an x-forwarded-for chain', () => {
    expect(cleanIpInput('1.2.3.4, 10.0.0.1, 172.16.0.1')).toBe('1.2.3.4')
  })

  it('unwraps ipv4-mapped ipv6', () => {
    expect(cleanIpInput('::ffff:1.2.3.4')).toBe('1.2.3.4')
  })

  it('returns null for blank input', () => {
    expect(cleanIpInput('')).toBeNull()
    expect(cleanIpInput(null)).toBeNull()
    expect(cleanIpInput(undefined)).toBeNull()
  })
})

describe('parseIp', () => {
  it('parses ipv4', () => {
    expect(parseIp('192.168.1.1')).toMatchObject({ family: 4, canonical: '192.168.1.1' })
  })

  it('rejects out-of-range octets and malformed input', () => {
    expect(parseIp('256.1.1.1')).toBeNull()
    expect(parseIp('1.2.3')).toBeNull()
    expect(parseIp('not-an-ip')).toBeNull()
    expect(parseIp('1.2.3.4.5')).toBeNull()
  })

  it('compresses ipv6 to its canonical form', () => {
    expect(parseIp('2001:0DB8:0000:0000:0000:0000:0000:0001')?.canonical).toBe('2001:db8::1')
    expect(parseIp('0:0:0:0:0:0:0:1')?.canonical).toBe('::1')
  })

  it('treats an ipv4-mapped address as ipv4', () => {
    expect(parseIp('::ffff:203.0.113.5')).toMatchObject({ family: 4, canonical: '203.0.113.5' })
  })

  it('rejects malformed ipv6', () => {
    expect(parseIp('2001:db8::1::2')).toBeNull()
    expect(parseIp('2001:db8:zzzz::1')).toBeNull()
  })
})

describe('parseIpRule', () => {
  it('treats a bare address as a single-host rule', () => {
    expect(rule('203.0.113.7')).toMatchObject({ kind: 'single', prefix: 32, canonical: '203.0.113.7' })
  })

  it('zeroes host bits so a sloppy cidr still matches', () => {
    expect(rule('203.0.113.77/24').canonical).toBe('203.0.113.0/24')
  })

  it('rejects a prefix wider than the family allows', () => {
    expect(parseIpRule('203.0.113.0/33')).toBeNull()
    expect(parseIpRule('2001:db8::/129')).toBeNull()
  })

  it('reports how many addresses a rule covers', () => {
    expect(ipRuleSize(rule('203.0.113.7'))).toBe(1n)
    expect(ipRuleSize(rule('203.0.113.0/24'))).toBe(256n)
    expect(ipRuleSize(rule('2001:db8::/112'))).toBe(65536n)
  })
})

describe('normalizeIpRule', () => {
  it('canonicalizes storable values and rejects junk', () => {
    expect(normalizeIpRule(' 203.0.113.7:9000 ')).toBe('203.0.113.7')
    expect(normalizeIpRule('2001:0DB8::/32')).toBe('2001:db8::/32')
    expect(normalizeIpRule('hello')).toBeNull()
  })
})

describe('ipMatchesRule', () => {
  it('matches a single address exactly', () => {
    expect(ipMatchesRule('203.0.113.7', rule('203.0.113.7'))).toBe(true)
    expect(ipMatchesRule('203.0.113.8', rule('203.0.113.7'))).toBe(false)
  })

  it('matches every address inside a range', () => {
    const range = rule('203.0.113.0/24')
    expect(ipMatchesRule('203.0.113.0', range)).toBe(true)
    expect(ipMatchesRule('203.0.113.255', range)).toBe(true)
    expect(ipMatchesRule('203.0.114.0', range)).toBe(false)
  })

  it('matches through port and ipv4-mapped wrappers', () => {
    expect(ipMatchesRule('::ffff:203.0.113.7', rule('203.0.113.0/24'))).toBe(true)
    expect(ipMatchesRule('203.0.113.7:51000', rule('203.0.113.7'))).toBe(true)
  })

  it('never matches across families', () => {
    expect(ipMatchesRule('2001:db8::1', rule('0.0.0.0/0'))).toBe(false)
    expect(ipMatchesRule('1.2.3.4', rule('::/0'))).toBe(false)
  })

  it('matches ipv6 ranges', () => {
    const range = rule('2001:db8::/32')
    expect(ipMatchesRule('2001:db8:1234::9', range)).toBe(true)
    expect(ipMatchesRule('2001:db9::1', range)).toBe(false)
  })

  it('does not match an unparseable address', () => {
    expect(ipMatchesRule(null, rule('0.0.0.0/0'))).toBe(false)
    expect(ipMatchesRule('unknown', rule('0.0.0.0/0'))).toBe(false)
  })
})
