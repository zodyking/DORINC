import { describe, expect, it } from 'vitest'
import {
  extractClientIpFromForwarded,
  getClientIp,
  isKnownProxyIp,
  normalizeClientIp,
} from '../../server/utils/client-ip'

function mockEvent(headers: Record<string, string> = {}, socketIp = '172.70.127.128') {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  )

  return {
    node: {
      req: {
        socket: { remoteAddress: socketIp },
        headers: normalized,
      },
    },
  } as Parameters<typeof getClientIp>[0]
}

describe('client ip extraction', () => {
  it('normalizes forwarded IPv4 addresses', () => {
    expect(normalizeClientIp('203.0.113.10, 10.0.0.1')).toBe('203.0.113.10')
    expect(normalizeClientIp('203.0.113.10:443')).toBe('203.0.113.10')
    expect(normalizeClientIp('::ffff:203.0.113.10')).toBe('203.0.113.10')
  })

  it('detects cloudflare proxy addresses', () => {
    expect(isKnownProxyIp('172.70.127.128')).toBe(true)
    expect(isKnownProxyIp('203.0.113.10')).toBe(false)
  })

  it('prefers cf-connecting-ip over the cloudflare socket peer', () => {
    const event = mockEvent({
      'cf-connecting-ip': '73.89.120.44',
      'x-forwarded-for': '73.89.120.44, 172.70.127.128',
    })

    expect(getClientIp(event)).toBe('73.89.120.44')
  })

  it('extracts the leftmost public client from x-forwarded-for', () => {
    expect(
      extractClientIpFromForwarded('73.89.120.44, 172.70.127.128'),
    ).toBe('73.89.120.44')
  })

  it('skips cloudflare hops when only forwarded headers are present', () => {
    const event = mockEvent({
      'x-forwarded-for': '73.89.120.44, 172.70.127.128',
    })

    expect(getClientIp(event)).toBe('73.89.120.44')
  })
})
