import { describe, expect, it } from 'vitest'
import { normalizeClientIp } from '../../server/utils/client-ip'

describe('ip geolocation helpers', () => {
  it('normalizes forwarded IPv4 addresses', () => {
    expect(normalizeClientIp('203.0.113.10, 10.0.0.1')).toBe('203.0.113.10')
    expect(normalizeClientIp('203.0.113.10:443')).toBe('203.0.113.10')
    expect(normalizeClientIp('::ffff:203.0.113.10')).toBe('203.0.113.10')
  })

  it('returns null for empty or private addresses', () => {
    expect(normalizeClientIp('')).toBeNull()
    expect(normalizeClientIp('127.0.0.1')).toBe('127.0.0.1')
    expect(normalizeClientIp('192.168.1.4')).toBe('192.168.1.4')
  })
})
