import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DEVICE_ID_COOKIE,
  DEVICE_ID_HEADER,
  createDeviceId,
  isValidDeviceId,
  normalizeDeviceId,
} from '../../shared/device-id'
import {
  createOutsideGeoBypassToken,
  hashUserAgent,
  verifyOutsideGeoBypassToken,
} from '../../server/auth/outside-geo-bypass'

describe('device id helpers', () => {
  it('exports stable cookie/header names', () => {
    expect(DEVICE_ID_COOKIE).toBe('dorinc_device_id')
    expect(DEVICE_ID_HEADER).toBe('x-device-id')
  })

  it('creates valid UUID v4 device ids', () => {
    const id = createDeviceId()
    expect(isValidDeviceId(id)).toBe(true)
    expect(normalizeDeviceId(id)).toBe(id)
  })

  it('normalizes case and rejects garbage', () => {
    const upper = '8F2A1B2C-3D4E-4F5A-A6B7-C8D9E0F1A2B3'
    expect(normalizeDeviceId(upper)).toBe(upper.toLowerCase())
    expect(normalizeDeviceId('not-a-uuid')).toBeNull()
    expect(normalizeDeviceId('')).toBeNull()
    expect(normalizeDeviceId(null)).toBeNull()
  })
})

describe('outside geo bypass with device_id', () => {
  it('round-trips device_id in bypass tokens', () => {
    process.env.SESSION_SECRET = 'test-session-secret-for-device-id-bypass'
    const deviceId = '8f2a1b2c-3d4e-4f5a-a6b7-c8d9e0f1a2b3'
    const token = createOutsideGeoBypassToken({
      userId: 'user-1',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 TestBrowser',
      deviceId,
    })
    const parsed = verifyOutsideGeoBypassToken(token)
    expect(parsed?.userId).toBe('user-1')
    expect(parsed?.deviceId).toBe(deviceId)
    expect(parsed?.userAgentHash).toBe(hashUserAgent('Mozilla/5.0 TestBrowser'))
  })

  it('still verifies legacy tokens without device_id', () => {
    process.env.SESSION_SECRET = 'test-session-secret-for-device-id-bypass'
    // Build a v1-shaped token manually (userId|ip|uaHash|exp|sig)
    const uaHash = hashUserAgent('Mozilla/5.0')!
    const exp = Date.now() + 60_000
    const payload = ['user-legacy', '203.0.113.10', uaHash, String(exp)].join('|')
    const sig = createHmac('sha256', process.env.SESSION_SECRET!).update(payload).digest('hex')
    const token = Buffer.from(`${payload}|${sig}`).toString('base64url')
    const parsed = verifyOutsideGeoBypassToken(token)
    expect(parsed?.userId).toBe('user-legacy')
    expect(parsed?.deviceId).toBeNull()
    expect(parsed?.userAgentHash).toBe(uaHash)
  })
})
