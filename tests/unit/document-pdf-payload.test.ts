import { describe, expect, it } from 'vitest'
import {
  addressLines,
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
  businessProfileToDocumentPdfCompany,
  formatPdfVehicleUnitDisplay,
  formatPdfVehicleYearMakeModel,
  invoicePdfPaymentStatusLabel,
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
        phone: '5555550199',
        email: 'billing@acme.test',
        billingAddress: {
          line1: '100 Industrial Way',
          city: 'Newark',
          state: 'NJ',
          postalCode: '07102',
        },
      },
      vehicleSnapshot: {
        unitType: 'bus',
        busNumber: '606',
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
    expect(data.statusLabel).toBe('Payment Due')
    expect(data.dueLabel).toBe('Net 30')
    expect(data.totals.total).toBe('$430.00')
    expect(data.lineItems).toHaveLength(2)
    expect(data.lineItems[0]?.typeBadge).toBe('P')
    expect(data.customer.addressLines).toEqual(['100 Industrial Way', 'Newark, NJ 07102'])
    expect(data.customer.phone).toBe('(555) 555 0199')
    expect(data.vehicle?.unitNumber).toBe('Bus #606')
    expect(data.vehicle?.plate).toBe('2018 Freightliner M2')

    const payload = buildDocumentPdfRenderPayload(data, { paper: 'a4', marginInches: 0.75 })
    expect(payload.options.paper).toBe('a4')
    expect(payload.options.margins.top).toBe(0.75)
  })

  it('formats customer zip addresses without printing undefined', () => {
    expect(addressLines({
      line1: '739 E New York Ave',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11207',
    })).toEqual(['739 E New York Ave', 'Brooklyn, NY 11207'])

    expect(addressLines({
      line1: '739 E New York Ave',
      city: 'Brooklyn',
      state: 'NY',
      zip: undefined,
    })).toEqual(['739 E New York Ave', 'Brooklyn, NY'])

    expect(addressLines({
      line1: '100 Main',
      city: 'Staten Island',
      state: 'NY',
    })).toEqual(['100 Main', 'Staten Island, NY'])

    const data = buildInvoicePdfData({
      invoiceNumberFormatted: 'INV-000697',
      invoiceDate: '2026-07-02',
      paymentTerms: 'due_on_receipt',
      status: 'sent',
      customerSnapshot: {
        displayName: 'Bnos Menachem Inc',
        billingAddress: {
          line1: '739 E New York Ave',
          city: 'Brooklyn',
          state: 'NY',
          zip: '11213',
        },
      },
      lineItems: [],
      feesAmount: '0',
      discountAmount: '0',
      taxAmount: '0',
      total: '0',
      balanceDue: '0',
    })

    expect(data.customer.addressLines.join(' ')).not.toContain('undefined')
    expect(data.customer.addressLines).toEqual([
      '739 E New York Ave',
      'Brooklyn, NY 11213',
    ])
  })

  it('shows payment status on invoice PDFs instead of workflow status', () => {
    expect(invoicePdfPaymentStatusLabel('430.00', 'sent')).toBe('Payment Due')
    expect(invoicePdfPaymentStatusLabel('0', 'sent')).toBe('Paid in Full')
    expect(invoicePdfPaymentStatusLabel('100.00', 'paid')).toBe('Paid in Full')
    expect(invoicePdfPaymentStatusLabel('50.00', 'void')).toBe('')

    const paid = buildInvoicePdfData({
      invoiceNumberFormatted: 'INV-000100',
      invoiceDate: '2026-01-15',
      paymentTerms: 'net_30',
      status: 'paid',
      lineItems: [],
      feesAmount: '0',
      discountAmount: '0',
      taxAmount: '0',
      total: '500.00',
      balanceDue: '0',
    })
    expect(paid.statusLabel).toBe('Paid in Full')
  })

  it('formats fleet unit and year/make/model for PDF vehicle blocks', () => {
    expect(formatPdfVehicleUnitDisplay({
      unitType: 'bus',
      busNumber: '606',
      year: 2019,
      make: 'Blue Bird',
      model: 'Vision',
    })).toBe('Bus #606')

    expect(formatPdfVehicleYearMakeModel({
      year: 2019,
      make: 'Blue Bird',
      model: 'Vision',
      trim: 'FE',
    })).toBe('2019 Blue Bird Vision FE')

    expect(formatPdfVehicleUnitDisplay({
      unitType: 'truck',
      unitTag: 'HL-114',
    })).toBe('Truck · HL-114')
  })

  it('maps business profile settings to PDF company block', () => {
    const company = businessProfileToDocumentPdfCompany({
      businessName: 'Acme Fleet Service',
      phone: '5555550100',
      email: 'shop@acme.test',
      website: 'https://acme.test',
      addressLine1: '100 Industrial Way',
      addressLine2: 'Suite 4',
      city: 'Newark',
      state: 'NJ',
      postalCode: '07102',
      country: 'US',
    })

    expect(company).toEqual({
      name: 'Acme Fleet Service',
      addressLine1: '100 Industrial Way',
      addressLine2: 'Suite 4, Newark, NJ 07102',
      phone: '(555) 555 0100',
      email: 'shop@acme.test',
      website: 'https://acme.test',
    })
  })
})
