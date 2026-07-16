import { describe, expect, it } from 'vitest'
import {
  auditActionShortLabel,
  formatAuditChangeMessage,
  isEditingSessionNoise,
} from '../../shared/audit-messages'

describe('audit-messages', () => {
  it('formats invoice line price changes in plain English', () => {
    const message = formatAuditChangeMessage({
      action: 'invoices.line_items.update',
      changedFields: ['unitPrice', 'lineAmount'],
      beforeData: {
        description: 'Holiday Surcharge',
        unitPrice: '50.00',
        lineAmount: '50.00',
      },
      afterData: {
        description: 'Holiday Surcharge',
        unitPrice: '100.00',
        lineAmount: '100.00',
      },
    })
    expect(message).toBe('Changed rate from $50.00 to $100.00; Changed amount from $50.00 to $100.00 on "Holiday Surcharge"')
  })

  it('formats added and removed line items', () => {
    expect(formatAuditChangeMessage({
      action: 'invoices.line_items.create',
      afterData: { description: 'Replace R/S Tire', lineAmount: '325.00' },
    })).toBe('Added line "Replace R/S Tire" ($325.00)')

    expect(formatAuditChangeMessage({
      action: 'invoices.line_items.delete',
      beforeData: { description: 'Shop supplies', lineAmount: '12.00' },
    })).toBe('Removed line "Shop supplies" ($12.00)')
  })

  it('formats invoice header field changes', () => {
    expect(formatAuditChangeMessage({
      action: 'invoices.update',
      changedFields: ['invoiceDate', 'dueDate'],
      beforeData: { invoiceDate: '2026-07-01', dueDate: '2026-07-31' },
      afterData: { invoiceDate: '2026-07-16', dueDate: '2026-07-16' },
    })).toBe('Updated invoice — Changed invoice date from 2026-07-01 to 2026-07-16; Changed due date from 2026-07-31 to 2026-07-16')
  })

  it('labels actions without system codes', () => {
    expect(auditActionShortLabel('auth.login')).toBe('Staff signed in')
    expect(auditActionShortLabel('editing_sessions.acquire')).toBe('Opened for editing')
  })

  it('flags editing session noise for entity history', () => {
    expect(isEditingSessionNoise('editing_sessions.acquire')).toBe(true)
    expect(isEditingSessionNoise('invoices.line_items.create')).toBe(false)
  })
})
