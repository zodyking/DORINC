import { describe, expect, it } from 'vitest'
import type { PortalLineItemCorrectionPayload } from '#shared/portal-invoice-correction'
import {
  staffBuildLineItemCorrectionApply,
  staffCorrectionApplySummary,
  staffLineItemApplyFields,
  staffRequestActionType,
  staffRequestApproveHint,
  staffRequestApproveLabel,
  staffRequestKindLabel,
  staffRequestOutcomeSummary,
  staffRequestPreviewText,
  staffRequestStatusPill,
  staffRequestSubmitter,
  staffRequestTypeBadge,
  staffRequestUrgencyPill,
  staffValidateCorrectionApplyFields,
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
    expect(staffRequestApproveLabel({ kind: 'service' })).toBe('Create draft invoice')
    expect(staffRequestApproveLabel({ kind: 'invoice_change' })).toBe('Mark resolved')
    expect(staffRequestApproveLabel({ kind: 'general' })).toBe('Mark resolved')

    const linePayload: PortalLineItemCorrectionPayload = {
      kind: 'line_item',
      lineItemId: 'line-1',
      original: { description: 'Oil', quantity: '1', unitPrice: '60.00' },
      proposed: { description: 'Oil', quantity: '1', unitPrice: '55.00' },
    }
    expect(staffRequestApproveLabel({ kind: 'invoice_change', correctionPayload: linePayload })).toBe('Apply to invoice')
    expect(staffRequestActionType({ kind: 'invoice_change', correctionPayload: linePayload })).toBe('line_correction')
  })

  it('describes billing inquiries separately from structured corrections', () => {
    const inquiry = {
      kind: 'invoice_change',
      invoiceId: 'inv-1',
      invoiceNumberFormatted: 'INV-000105',
    }
    expect(staffRequestTypeBadge(inquiry).label).toBe('Billing inquiry')
    expect(staffRequestApproveHint(inquiry)).toContain('without changing the invoice')
    expect(staffRequestOutcomeSummary(inquiry)).toContain('invoice unchanged')
    expect(staffRequestPreviewText({ kind: 'general', summary: 'hello' })).toBe('hello')
  })

  it('builds partial line item apply payloads', () => {
    const payload: PortalLineItemCorrectionPayload = {
      kind: 'line_item',
      lineItemId: 'line-1',
      original: { description: 'Change Oil', quantity: '1.00', unitPrice: '60.00' },
      proposed: { description: 'Change Oil', quantity: '1.00', unitPrice: '55.00' },
    }
    const fields = staffLineItemApplyFields(payload)
    fields.find(field => field.key === 'unitPrice')!.apply = '57.50'
    expect(staffBuildLineItemCorrectionApply(fields)).toEqual({
      kind: 'line_item',
      description: 'Change Oil',
      quantity: '1.00',
      unitPrice: '57.50',
    })
    expect(staffCorrectionApplySummary(fields).customCount).toBe(1)
    expect(staffValidateCorrectionApplyFields(fields)).toBeNull()
  })

  it('reuses portal status pills', () => {
    expect(staffRequestStatusPill('pending').label).toBe('Under review')
    expect(staffRequestStatusPill('approved').cls).toBe('pill ok')
  })
})
