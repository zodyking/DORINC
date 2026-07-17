import { describe, expect, it } from 'vitest'
import { buildInvoiceCustomerSupportNote } from '../../shared/invoice-customer-support'
import { buildInvoicePdfData } from '../../shared/document-pdf-payload'

describe('invoice customer support note', () => {
  it('uses business email and portal url in support lines', () => {
    const note = buildInvoiceCustomerSupportNote({
      name: 'Devon Onsite Repairs INC',
      addressLine1: '',
      addressLine2: '',
      phone: '',
      email: 'accounting@devononsiterepairs.com',
      website: '',
    }, 'https://devononsiterepairs.com/portal')

    expect(note.title).toBe('Questions, changes, or portal access')
    expect(note.lines[0]).toContain('accounting@devononsiterepairs.com')
    expect(note.lines.some(line => line.includes('Customer portal:'))).toBe(true)
    expect(note.lines.at(-1)).toContain('portal access')
  })

  it('is included on invoice pdf data payloads', () => {
    const data = buildInvoicePdfData({
      invoiceNumberFormatted: 'INV-1001',
      invoiceDate: '2026-07-17',
      paymentTerms: 'due_on_receipt',
      status: 'sent',
      lineItems: [],
      feesAmount: '0.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      total: '100.00',
      balanceDue: '100.00',
    }, {
      company: {
        name: 'Devon Onsite Repairs INC',
        addressLine1: '',
        addressLine2: '',
        phone: '',
        email: 'accounting@devononsiterepairs.com',
        website: '',
      },
      portalUrl: 'https://devononsiterepairs.com/portal',
    })

    expect(data.customerSupport.lines[0]).toContain('accounting@devononsiterepairs.com')
  })
})
