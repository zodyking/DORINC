import { describe, expect, it } from 'vitest'
import { deriveServiceLogInvoiceLinkStatus } from '../../server/services/invoice-link-status.service'
import { serviceLogStatusPill } from '../../app/utils/service-logs-ui'

describe('deriveServiceLogInvoiceLinkStatus', () => {
  it('returns Sent for sent or paid invoices', () => {
    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'sent',
      wasSavedAtLeastOnce: false,
      hasPendingSend: false,
    })).toEqual({ key: 'sent', label: 'Sent' })

    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'paid',
      wasSavedAtLeastOnce: false,
      hasPendingSend: false,
    })).toEqual({ key: 'sent', label: 'Sent' })
  })

  it('returns Invoiced for saved drafts and manager approval', () => {
    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'pending_manager_approval',
      wasSavedAtLeastOnce: false,
      hasPendingSend: false,
    })).toEqual({ key: 'in_progress', label: 'Invoiced' })

    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      wasSavedAtLeastOnce: true,
      hasPendingSend: false,
    })).toEqual({ key: 'in_progress', label: 'Invoiced' })

    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      wasSavedAtLeastOnce: false,
      hasPendingSend: true,
    })).toEqual({ key: 'in_progress', label: 'Invoiced' })
  })

  it('returns In queue for untouched draft invoices', () => {
    expect(deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      wasSavedAtLeastOnce: false,
      hasPendingSend: false,
    })).toEqual({ key: 'queued', label: 'In queue' })
  })
})

describe('serviceLogStatusPill for converted logs', () => {
  it('mirrors linked invoice progress labels', () => {
    expect(serviceLogStatusPill('converted_to_invoice', {
      invoiceId: 'inv-1',
      invoiceLinkStatus: { key: 'queued', label: 'In queue' },
    })).toEqual({ cls: 'pill warn', label: 'In queue' })

    expect(serviceLogStatusPill('converted_to_invoice', {
      invoiceId: 'inv-1',
      invoiceLinkStatus: { key: 'in_progress', label: 'Invoiced' },
    })).toEqual({ cls: 'pill ok', label: 'Invoiced' })

    expect(serviceLogStatusPill('converted_to_invoice', {
      invoiceId: 'inv-1',
      invoiceLinkStatus: { key: 'sent', label: 'Sent' },
    })).toEqual({ cls: 'pill ok', label: 'Sent' })
  })
})
