import { describe, expect, it } from 'vitest'
import {
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
  parsePdfRenderPayload,
  serializePdfRenderPayload,
} from '../../shared/document-pdf-payload'
import {
  isPdfUpstreamFailureMessage,
  normalizePdfPaper,
  pdfUpstreamUnavailableMessage,
} from '../../shared/pdf-render'

describe('pdf-render helpers', () => {
  it('normalizes paper sizes', () => {
    expect(normalizePdfPaper('A4')).toBe('a4')
    expect(normalizePdfPaper('letter')).toBe('letter')
    expect(normalizePdfPaper('Letter')).toBe('letter')
  })

  it('detects upstream PDF failures', () => {
    expect(isPdfUpstreamFailureMessage('Laravel PDF service failed (500): boom')).toBe(true)
    expect(isPdfUpstreamFailureMessage('fetch failed')).toBe(true)
    expect(isPdfUpstreamFailureMessage('Invalid template HTML')).toBe(false)
  })

  it('builds operator-friendly upstream message', () => {
    const msg = pdfUpstreamUnavailableMessage('fetch failed')
    expect(msg).toContain('laravel-pdf')
    expect(msg).toContain('fetch failed')
  })
})

describe('document PDF payload', () => {
  const sampleDetail = {
    invoiceNumberFormatted: 'INV-000081',
    invoiceDate: '2026-07-08',
    paymentTerms: 'due_on_receipt',
    status: 'approved',
    complaint: 'Engine noise',
    customerName: 'Jane Doe',
    customerSnapshot: {
      displayName: 'Jane Doe',
      phone: '555-0100',
      email: 'jane@example.com',
      billingAddress: {
        line1: '1 Main St',
        city: 'Brooklyn',
        state: 'NY',
        zip: '11207',
      },
    },
    vehicleSnapshot: null,
    lineItems: [{
      description: 'Diagnostic',
      lineType: 'labor',
      quantity: '1',
      unitPrice: '100.00',
      lineAmount: '100.00',
    }],
    feesAmount: '0',
    discountAmount: '0',
    taxAmount: '0',
    total: '100.00',
    balanceDue: '100.00',
  }

  it('serializes and parses Blade render payloads', () => {
    const data = buildInvoicePdfData(sampleDetail)
    const payload = buildDocumentPdfRenderPayload(data, { paper: 'letter', marginInches: 0.5 })
    const raw = serializePdfRenderPayload(payload)
    const parsed = parsePdfRenderPayload(raw)
    expect(parsed?.documentType).toBe('invoice')
    expect(parsed?.data.number).toBe('INV-000081')
    expect(parsed?.options.paper).toBe('letter')
  })
})
