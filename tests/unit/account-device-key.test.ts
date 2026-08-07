import { describe, expect, it } from 'vitest'

/**
 * Mirrors account.service deviceKey grouping rules used for Known devices.
 * Kept local so the unit test does not need a DB.
 */
function deviceKey(deviceId: string | null | undefined, userAgent: string | null | undefined): string {
  const id = deviceId?.trim().toLowerCase()
  if (id) return `id:${id}`
  const ua = userAgent?.trim()
  return ua ? `ua:${ua}` : 'unknown'
}

describe('known device grouping key', () => {
  it('prefers first-party device_id over user-agent', () => {
    const a = deviceKey('8f2a1b2c-3d4e-4f5a-a6b7-c8d9e0f1a2b3', 'Mozilla/5.0 Chrome/120')
    const b = deviceKey('8f2a1b2c-3d4e-4f5a-a6b7-c8d9e0f1a2b3', 'Mozilla/5.0 Chrome/121')
    expect(a).toBe(b)
    expect(a.startsWith('id:')).toBe(true)
  })

  it('falls back to user-agent when device_id is missing', () => {
    expect(deviceKey(null, 'Mozilla/5.0 Safari')).toBe('ua:Mozilla/5.0 Safari')
    expect(deviceKey(undefined, null)).toBe('unknown')
  })

  it('does not merge different device ids that share a user-agent', () => {
    const ua = 'Mozilla/5.0 Chrome/120'
    expect(deviceKey('11111111-1111-4111-8111-111111111111', ua))
      .not.toBe(deviceKey('22222222-2222-4222-8222-222222222222', ua))
  })
})
