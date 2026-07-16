import { describe, expect, it } from 'vitest'
import { deriveServiceLogInvoiceLinkStatus } from '../../server/services/invoice-link-status.service'

describe('deriveServiceLogInvoiceLinkStatus', () => {
  it('returns Sent for sent or paid invoices', () => {
    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'sent',
      hasActiveEditSession: false,
      wasOpenedOrModified: false,
      hasPendingSend: false,
    })).toEqual({ key: 'sent', label: 'Sent' })

    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'paid',
      hasActiveEditSession: false,
      wasOpenedOrModified: false,
      hasPendingSend: false,
    })).toEqual({ key: 'sent', label: 'Sent' })
  })

  it('returns In progress for manager approval or touched drafts', () => {
    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'pending_manager_approval',
      hasActiveEditSession: false,
      wasOpenedOrModified: false,
      hasPendingSend: false,
    })).toEqual({ key: 'in_progress', label: 'In progress' })

    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      hasActiveEditSession: true,
      wasOpenedOrModified: false,
      hasPendingSend: false,
    })).toEqual({ key: 'in_progress', label: 'In progress' })

    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      hasActiveEditSession: false,
      wasOpenedOrModified: true,
      hasPendingSend: false,
    })).toEqual({ key: 'in_progress', label: 'In progress' })
  })

  it('returns Queued for untouched draft invoices', () => {
    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      hasActiveEditSession: false,
      wasOpenedOrModified: false,
      hasPendingSend: false,
    })).toEqual({ key: 'queued', label: 'Queued' })
  })
})
