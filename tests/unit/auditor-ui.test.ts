// Unit tests for external auditor UI helpers (P3-12).
import { describe, expect, it } from 'vitest'
import { auditorAccessBanner, auditorInvoiceSub } from '../../app/utils/auditor-ui'

describe('P3-12 auditor UI helpers', () => {
  it('describes restricted access', () => {
    expect(auditorAccessBanner()).toContain('Read-only auditor access')
  })

  it('maps invoice statuses for auditor table', () => {
    expect(auditorInvoiceSub('sent')).toBe('Outstanding')
    expect(auditorInvoiceSub('paid')).toBe('Settled')
    expect(auditorInvoiceSub('pending_manager_approval')).toContain('pending')
  })
})
