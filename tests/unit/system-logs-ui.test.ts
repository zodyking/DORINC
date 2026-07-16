import { describe, expect, it } from 'vitest'
import {
  auditActionLabel,
  auditActionPill,
  auditActorDisplay,
  auditDetailDisplay,
  auditIpDisplay,
  auditLocationDisplay,
  entityTypeLabel,
} from '../../app/utils/system-logs-ui'

describe('system-logs-ui helpers (P1-33)', () => {
  it('labels entity types for filter display', () => {
    expect(entityTypeLabel('service_log')).toBe('Service log')
    expect(entityTypeLabel('custom_thing')).toBe('custom thing')
  })

  it('shows actor name or system fallback', () => {
    expect(auditActorDisplay('Devon R.', 'devon@example.com')).toBe('Devon R.')
    expect(auditActorDisplay(null, null)).toBe('system')
  })

  it('maps known actions to readable labels', () => {
    expect(auditActionLabel('customers.create')).toBe('Customer created')
    expect(auditActionLabel('auth.login')).toBe('Staff signed in')
  })

  it('assigns pill classes like the mockup', () => {
    expect(auditActionPill('user.role.changed', 'high').cls).toBe('pill bad')
    expect(auditActionPill('auth.login').cls).toBe('pill gray')
    expect(auditActionPill('backup.completed').cls).toBe('pill ok')
    expect(auditActionPill('flags.updated').cls).toBe('pill warn')
    expect(auditActionPill('invoices.create').label).toBe('Invoice created')
  })

  it('summarizes audit detail from afterData', () => {
    const detail = auditDetailDisplay({
      entityType: 'customer',
      entityId: 'abc-123',
      action: 'customers.create',
      changedFields: null,
      afterData: { displayName: 'Hollis Logistics LLC' },
      beforeData: null,
      actorName: 'Devon R.',
    })
    expect(detail).toBe('Customer created — Hollis Logistics LLC')
  })

  it('formats IP addresses', () => {
    expect(auditIpDisplay('10.0.4.2')).toBe('10.0.4.2')
    expect(auditIpDisplay('127.0.0.1')).toBe('localhost')
    expect(auditIpDisplay(null)).toBe('—')
  })

  it('prefers recorded login location over IP in the location column', () => {
    expect(auditLocationDisplay({
      action: 'auth.login',
      afterData: { locationLabel: 'Brooklyn, NY', locationSource: 'device' },
      ipAddress: '203.0.113.1',
    })).toBe('Brooklyn, NY')

    expect(auditLocationDisplay({
      action: 'auth.login',
      afterData: null,
      ipAddress: '203.0.113.1',
    })).toBe('—')

    expect(auditLocationDisplay({
      action: 'portal.login',
      afterData: { locationLabel: 'Austin, TX', locationSource: 'ip' },
      ipAddress: '203.0.113.2',
    })).toBe('Austin, TX')

    expect(auditLocationDisplay({
      action: 'portal.login',
      afterData: null,
      ipAddress: '203.0.113.2',
    })).toBe('203.0.113.2')

    expect(auditLocationDisplay({
      action: 'customers.create',
      afterData: null,
      ipAddress: '10.0.4.2',
    })).toBe('10.0.4.2')
  })
})
