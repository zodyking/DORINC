import { describe, expect, it } from 'vitest'
import { normalizeClientIp } from '../../server/utils/client-ip'

// Test NYC borough refinement via the internal formatting path.
// We import the service and mock fetch for unit tests.

describe('ip geolocation helpers', () => {
  it('normalizes forwarded IPv4 addresses', () => {
    expect(normalizeClientIp('203.0.113.10, 10.0.0.1')).toBe('203.0.113.10')
    expect(normalizeClientIp('203.0.113.10:443')).toBe('203.0.113.10')
    expect(normalizeClientIp('::ffff:203.0.113.10')).toBe('203.0.113.10')
  })

  it('returns null for empty addresses', () => {
    expect(normalizeClientIp('')).toBeNull()
  })
})

describe('resolveIpLocation formatting', () => {
  it('returns city and state only without ISP provider suffix', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('ip-api.com')) {
        return new Response(JSON.stringify({
          status: 'success',
          city: 'New York',
          regionName: 'New York',
          region: 'NY',
          country: 'United States',
          countryCode: 'US',
          zip: '11201',
        }))
      }
      return new Response(JSON.stringify({ success: false }))
    }

    const { resolveIpLocation } = await import('../../server/services/ip-geolocation.service')
    const label = await resolveIpLocation('203.0.113.55')
    expect(label).toBe('Brooklyn, NY')
    expect(label).not.toContain('Optimum')
    expect(label).not.toContain('·')

    globalThis.fetch = originalFetch
  })

  it('refines generic New York city to Brooklyn using ZIP prefix', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('ipwho.is')) {
        return new Response(JSON.stringify({
          success: true,
          city: 'New York',
          region: 'New York',
          region_code: 'NY',
          country: 'United States',
          country_code: 'US',
          postal: '11215',
        }))
      }
      return new Response(JSON.stringify({ status: 'fail' }))
    }

    const { resolveIpLocation } = await import('../../server/services/ip-geolocation.service')
    const label = await resolveIpLocation('64.120.33.68')
    expect(label).toBe('Brooklyn, NY')

    globalThis.fetch = originalFetch
  })
})
