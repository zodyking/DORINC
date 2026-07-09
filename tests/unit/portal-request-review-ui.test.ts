import { describe, expect, it } from 'vitest'
import {
  staffRequestApproveLabel,
  staffRequestKindLabel,
  staffRequestStatusPill,
  staffRequestSubmitter,
  staffRequestUrgencyPill,
} from '../../app/utils/portal-request-review-ui'

describe('portal-request-review-ui helpers (P2-09)', () => {
  it('labels request kinds for staff queue', () => {
    expect(staffRequestKindLabel('invoice_change')).toBe('Billing')
    expect(staffRequestKindLabel('new_vehicle')).toBe('New vehicle')
    expect(staffRequestKindLabel('service')).toBe('Service')
  })

  it('maps urgency to pills', () => {
    expect(staffRequestUrgencyPill('normal')).toBeNull()
    expect(staffRequestUrgencyPill('urgent')?.label).toBe('Urgent')
    expect(staffRequestUrgencyPill('soon')?.cls).toBe('pill warn')
  })

  it('formats submitter display', () => {
    expect(staffRequestSubmitter('Alex', 'alex@example.com')).toBe('Alex · alex@example.com')
    expect(staffRequestSubmitter(null, 'alex@example.com')).toBe('alex@example.com')
  })

  it('uses action-specific approve labels', () => {
    expect(staffRequestApproveLabel('service')).toBe('Create draft invoice')
    expect(staffRequestApproveLabel('invoice_change')).toBe('Approve & revise')
    expect(staffRequestApproveLabel('general')).toBe('Approve')
  })

  it('reuses portal status pills', () => {
    expect(staffRequestStatusPill('pending').label).toBe('Under review')
    expect(staffRequestStatusPill('approved').cls).toBe('pill ok')
  })
})
