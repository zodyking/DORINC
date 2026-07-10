import { describe, expect, it } from 'vitest'
import {
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
} from '../../shared/document-pdf-payload'

describe('document-pdf-payload', () => {
  it('builds invoice PDF data with formatted money and status', () => {
    const data = buildInvoicePdfData({
      invoiceNumberFormatted: 'INV-000099',
      invoiceDate: '2026-01-15',
      paymentTerms: 'net_30',
      status: 'sent',
      complaint: 'Brake squeal',
      customerName: 'Acme Fleet',
      customerSnapshot: {
        displayName: 'Acme Fleet',
        phone: '555-0199',
        email: 'billing@acme.test',
        billingAddress: {
          line1: '100 Industrial Way',
          city: 'Newark',
          state: 'NJ',
          postalCode: '07102',
        },
      },
      vehicleSnapshot: {
        busNumber: '42',
        year: 2018,
        make: 'Freightliner',
        model: 'M2',
        vin: '1FVXXXX',
        plate: 'NY-1234',
      },
      lineItems: [
        {
          description: 'Brake pads',
          lineType: 'part',
          quantity: '2',
          unitPrice: '85.00',
          lineAmount: '170.00',
        },
        {
          description: 'Install labor',
          lineType: 'labor',
          quantity: '2',
          unitPrice: '120.00',
          lineAmount: '240.00',
        },
      ],
      feesAmount: '12.00',
      discountAmount: '0',
      taxAmount: '8.00',
      total: '430.00',
      balanceDue: '430.00',
    })

    expect(data.documentTitle).toBe('INVOICE')
    expect(data.statusLabel).toBe('SENT')
    expect(data.dueLabel).toBe('Net 30')
    expect(data.totals.total).toBe('$430.00')
    expect(data.lineItems).toHaveLength(2)
    expect(data.lineItems[0]?.typeBadge).toBe('P')

    const payload = buildDocumentPdfRenderPayload(data, { paper: 'a4', marginInches: 0.75 })
    expect(payload.options.paper).toBe('a4')
    expect(payload.options.margins.top).toBe(0.75)
  })
})
