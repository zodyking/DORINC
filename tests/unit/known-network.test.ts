import { describe, expect, it, vi } from 'vitest'
import {
  formatNetworkLabel,
  ipsShareNetwork,
  networkKeyFromIp,
} from '../../shared/known-network'
import { hashToken } from '../../server/auth/tokens'

describe('known network fingerprints', () => {
  it('groups IPv4 addresses on the same /24', () => {
    expect(networkKeyFromIp('203.0.113.10')).toBe('203.0.113.0/24')
    expect(networkKeyFromIp('203.0.113.250')).toBe('203.0.113.0/24')
    expect(ipsShareNetwork('203.0.113.10', '203.0.113.40')).toBe(true)
    expect(ipsShareNetwork('203.0.113.10', '203.0.114.10')).toBe(false)
  })

  it('groups IPv6 addresses on the same /64', () => {
    expect(networkKeyFromIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'))
      .toBe('2001:db8:1:2::/64')
    expect(ipsShareNetwork(
      '2001:db8:1:2:aaaa::1',
      '2001:db8:1:2:ffff::9',
    )).toBe(true)
    expect(ipsShareNetwork(
      '2001:db8:1:2::1',
      '2001:db8:1:3::1',
    )).toBe(false)
  })

  it('rejects empty or invalid values', () => {
    expect(networkKeyFromIp(null)).toBeNull()
    expect(networkKeyFromIp('not-an-ip')).toBeNull()
    expect(networkKeyFromIp('999.1.1.1')).toBeNull()
    expect(ipsShareNetwork(null, '203.0.113.10')).toBe(false)
  })

  it('formats a compact account label', () => {
    expect(formatNetworkLabel('203.0.113.0/24')).toBe('203.0.113.x')
    expect(formatNetworkLabel('2001:db8:1:2::/64')).toBe('2001:db8:1:2::/64')
    expect(formatNetworkLabel(null)).toBe('Unknown network')
  })
})

describe('userHasKnownNetwork', () => {
  it('matches a prior completed session on the same /24 and ignores the current token', async () => {
    const currentToken = 'current-session-token'
    const created = new Date('2026-01-01T00:00:00.000Z')
    const later = new Date('2026-01-01T00:10:00.000Z')
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => ([
                {
                  id: 'cur',
                  ipAddress: '203.0.113.88',
                  tokenHash: hashToken(currentToken),
                  createdAt: later,
                  lastActivityAt: later,
                  revokedAt: null,
                },
                {
                  id: 'old',
                  ipAddress: '203.0.113.12',
                  tokenHash: 'old-hash',
                  createdAt: created,
                  lastActivityAt: later,
                  revokedAt: later,
                },
              ]),
            }),
          }),
        }),
      }),
    }

    const { userHasKnownNetwork } = await import('../../server/services/known-network.service')
    const known = await userHasKnownNetwork(db as never, {
      userId: 'user-1',
      ipAddress: '203.0.113.88',
      excludeSessionToken: currentToken,
    })
    expect(known).toBe(true)
  })

  it('does not treat an immediately revoked blocked login as a known network', async () => {
    const now = new Date('2026-01-01T00:00:02.000Z')
    const created = new Date('2026-01-01T00:00:00.000Z')
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => ([
                {
                  id: 'blocked',
                  ipAddress: '198.51.100.20',
                  tokenHash: 'blocked-hash',
                  createdAt: created,
                  lastActivityAt: created,
                  revokedAt: now,
                },
              ]),
            }),
          }),
        }),
      }),
    }

    const { userHasKnownNetwork } = await import('../../server/services/known-network.service')
    const known = await userHasKnownNetwork(db as never, {
      userId: 'user-1',
      ipAddress: '198.51.100.40',
    })
    expect(known).toBe(false)
  })
})

describe('login notification skips known networks', () => {
  it('returns known_network without queueing mail', async () => {
    vi.resetModules()
    const enqueueJob = vi.fn()
    vi.doMock('../../server/services/workspace-settings.service', () => ({
      isNotificationEnabled: async () => true,
    }))
    vi.doMock('../../server/services/email-branding.service', () => ({
      resolveEmailBrand: async () => ({ brandName: 'DORINC', appUrl: 'https://app.example.com' }),
    }))
    vi.doMock('../../server/services/email-templates.service', () => ({
      getActiveEmailTemplateContent: async () => null,
    }))
    vi.doMock('../../server/services/app-config.service', () => ({
      getAppUrl: () => 'https://app.example.com',
    }))
    vi.doMock('../../server/services/ip-geolocation.service', () => ({
      normalizeClientIp: (ip: string | null) => ip,
      resolveIpLocation: async () => 'Brooklyn, NY',
    }))
    vi.doMock('../../server/services/jobs.service', () => ({ enqueueJob }))
    vi.doMock('../../server/services/known-network.service', () => ({
      userHasKnownNetwork: async () => true,
    }))

    const { sendLoginNotificationEmail } = await import('../../server/services/login-notification.service')
    const result = await sendLoginNotificationEmail({} as never, {
      to: 'alex@example.com',
      name: 'Alex',
      portal: 'staff',
      userId: 'user-1',
      ipAddress: '203.0.113.10',
      sessionToken: 'tok',
    })
    expect(result).toEqual({ delivered: false, reason: 'known_network' })
    expect(enqueueJob).not.toHaveBeenCalled()
    vi.doUnmock('../../server/services/workspace-settings.service')
    vi.doUnmock('../../server/services/email-branding.service')
    vi.doUnmock('../../server/services/email-templates.service')
    vi.doUnmock('../../server/services/app-config.service')
    vi.doUnmock('../../server/services/ip-geolocation.service')
    vi.doUnmock('../../server/services/jobs.service')
    vi.doUnmock('../../server/services/known-network.service')
  })
})
