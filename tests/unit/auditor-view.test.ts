// Unit tests for auditor view redaction (P3-12).
import { describe, expect, it } from 'vitest'
import { isExternalAuditor, redactInvoiceForAuditor } from '../../server/utils/auditor-view'

describe('P3-12 auditor view redaction', () => {
  it('detects external auditor account type', () => {
    expect(isExternalAuditor('external_auditor')).toBe(true)
    expect(isExternalAuditor('accountant')).toBe(false)
  })

  it('redacts internal invoice fields', () => {
    const redacted = redactInvoiceForAuditor({
      id: '1',
      total: '100.00',
      internalNotes: 'secret',
      complaint: 'dpf fault',
    })
    expect(redacted.internalNotes).toBeNull()
    expect(redacted.complaint).toBeNull()
    expect(redacted.total).toBe('100.00')
  })
})
