import { describe, expect, it } from 'vitest'
import {
  previewTemplateHtmlSchema,
  previewTemplatePdfSchema,
  publishInvoiceTemplateSchema,
} from '../../shared/validators/invoice-templates'
import { buildDocumentPdfRenderPayload, buildInvoicePdfData } from '../../shared/document-pdf-payload'

describe('invoice template blade validators', () => {
  it('accepts bladeSource-only publish payloads', () => {
    const parsed = publishInvoiceTemplateSchema.parse({
      bladeSource: '<h1>{{ $doc[\'number\'] }}</h1>',
    })
    expect(parsed.bladeSource).toContain('$doc')
    expect(parsed.designSettings).toBeUndefined()
  })

  it('rejects empty publish payloads', () => {
    expect(() => publishInvoiceTemplateSchema.parse({})).toThrow()
  })

  it('accepts preview payloads with bladeSource', () => {
    expect(previewTemplatePdfSchema.parse({ bladeSource: '@php $x = 1; @endphp' }).bladeSource).toBeTruthy()
    expect(previewTemplateHtmlSchema.parse({ bladeSource: 'hello' }).bladeSource).toBe('hello')
  })
})

describe('document PDF payload bladeSource option', () => {
  it('includes bladeSource in render options when provided', () => {
    const data = buildInvoicePdfData({
      invoiceNumberFormatted: 'INV-000001',
      invoiceDate: '2026-07-11',
      paymentTerms: 'due_on_receipt',
      status: 'approved',
      lineItems: [],
      feesAmount: '0',
      discountAmount: '0',
      taxAmount: '0',
      total: '0',
      balanceDue: '0',
    })
    const payload = buildDocumentPdfRenderPayload(data, {
      paper: 'letter',
      marginInches: 0.5,
      bladeSource: '<div>custom</div>',
    })
    expect(payload.options.bladeSource).toBe('<div>custom</div>')
  })
})
