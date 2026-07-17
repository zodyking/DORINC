import { describe, expect, it } from 'vitest'
import {
  deletionPreservationNote,
  deletionRequestApproveLabel,
  deletionRequestOutcomeSummary,
  deletionRequestSubmitter,
  deletionRequestTypeBadge,
  deletionStatusPill,
} from '../../app/utils/deletion-requests-ui'

describe('deletion-requests-ui helpers', () => {
  it('formats submitter display', () => {
    expect(deletionRequestSubmitter('Alex', 'alex@example.com')).toBe('Alex · alex@example.com')
    expect(deletionRequestSubmitter(null, 'alex@example.com')).toBe('alex@example.com')
    expect(deletionRequestSubmitter(null, null)).toBe('Staff')
  })

  it('maps entity types to badges and approve labels', () => {
    expect(deletionRequestTypeBadge('customer').label).toBe('Customer')
    expect(deletionRequestApproveLabel('invoice')).toBe('Confirm delete invoice')
    expect(deletionRequestOutcomeSummary('conversation')).toContain('message history')
  })

  it('uses staff-aligned status pills', () => {
    expect(deletionStatusPill('pending').label).toBe('Under review')
    expect(deletionStatusPill('approved').label).toBe('Approved')
    expect(deletionStatusPill('rejected').label).toBe('Declined')
  })

  it('describes preservation per entity type', () => {
    expect(deletionPreservationNote('customer')).toContain('invoices')
    expect(deletionPreservationNote('invoice')).toContain('cannot be undone')
  })
})
