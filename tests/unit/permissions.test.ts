import { describe, expect, it } from 'vitest'
import { evaluatePermission } from '../../shared/permissions/evaluate'
import type { PermissionUser } from '../../shared/permissions/evaluate'

function user(partial: Partial<PermissionUser> = {}): PermissionUser {
  return {
    id: 'u1',
    accountType: 'accountant',
    isActive: true,
    emailVerifiedAt: '2026-01-01T00:00:00Z',
    approvedAt: '2026-01-02T00:00:00Z',
    ...partial,
  }
}

describe('evaluatePermission', () => {
  it('allows a bundled permission', () => {
    expect(evaluatePermission({ user: user(), required: 'invoices.create.all' }))
      .toEqual({ allowed: true })
  })

  it('rejects inactive users first', () => {
    expect(evaluatePermission({ user: user({ isActive: false }), required: 'invoices.read.all' }))
      .toEqual({ allowed: false, reason: 'inactive' })
  })

  it('rejects unverified internal users', () => {
    expect(evaluatePermission({ user: user({ emailVerifiedAt: null }), required: 'invoices.read.all' }))
      .toEqual({ allowed: false, reason: 'unverified' })
  })

  it('rejects unapproved internal users', () => {
    expect(evaluatePermission({ user: user({ approvedAt: null }), required: 'invoices.read.all' }))
      .toEqual({ allowed: false, reason: 'unapproved' })
  })

  it('does not require verification/approval for customers', () => {
    const customer = user({ accountType: 'customer', emailVerifiedAt: null, approvedAt: null })
    expect(evaluatePermission({ user: customer, required: 'portal.read.own', ownsRecord: true }))
      .toEqual({ allowed: true })
  })

  it('denies what the bundle does not grant', () => {
    const mechanic = user({ accountType: 'mechanic' })
    expect(evaluatePermission({ user: mechanic, required: 'invoices.create.all' }))
      .toEqual({ allowed: false, reason: 'not_granted' })
  })

  it('override allow grants beyond the bundle', () => {
    const mechanic = user({ accountType: 'mechanic' })
    expect(evaluatePermission({
      user: mechanic,
      required: 'invoices.read.all',
      overrides: { allow: ['invoices.read.all'], deny: [] },
    })).toEqual({ allowed: true })
  })

  it('deny wins over bundle', () => {
    expect(evaluatePermission({
      user: user(),
      required: 'invoices.create.all',
      overrides: { allow: [], deny: ['invoices.create.all'] },
    })).toEqual({ allowed: false, reason: 'denied' })
  })

  it('deny wins over override allow', () => {
    expect(evaluatePermission({
      user: user(),
      required: 'invoices.create.all',
      overrides: { allow: ['invoices.create.all'], deny: ['invoices.create.all'] },
    })).toEqual({ allowed: false, reason: 'denied' })
  })

  it('own scope fails when the record is not owned', () => {
    const mechanic = user({ accountType: 'mechanic' })
    expect(evaluatePermission({ user: mechanic, required: 'service_logs.read.own', ownsRecord: false }))
      .toEqual({ allowed: false, reason: 'scope' })
  })

  it('own scope passes for owned records', () => {
    const mechanic = user({ accountType: 'mechanic' })
    expect(evaluatePermission({ user: mechanic, required: 'service_logs.upload.own', ownsRecord: true }))
      .toEqual({ allowed: true })
  })
})

describe('requirePermission middleware', () => {
  it('throws 401 when unauthenticated and 403 when not permitted', async () => {
    const { requirePermission } = await import('../../server/utils/require-permission')

    const anonEvent = { context: {} } as never
    try {
      requirePermission(anonEvent, 'invoices.read.all')
      expect.unreachable()
    }
    catch (err) {
      expect((err as { statusCode: number }).statusCode).toBe(401)
    }

    const mechanicEvent = {
      context: {
        auth: {
          user: user({ accountType: 'mechanic' }),
          overrides: { allow: [], deny: [] },
        },
      },
    } as never
    try {
      requirePermission(mechanicEvent, 'invoices.send.all')
      expect.unreachable()
    }
    catch (err) {
      expect((err as { statusCode: number }).statusCode).toBe(403)
    }

    // Permitted path returns the user
    const okEvent = {
      context: {
        auth: {
          user: user(),
          overrides: { allow: [], deny: [] },
        },
      },
    } as never
    expect(requirePermission(okEvent, 'invoices.create.all').id).toBe('u1')
  })
})
