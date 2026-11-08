import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePublicInvoiceSlug,
  publicInvoicePath,
  publicInvoiceUrl,
  PUBLIC_INVOICE_PATH_PREFIX,
} from '../../shared/public-invoice'
import { buildInvoiceCustomerSupportNote } from '../../shared/invoice-customer-support'

const root = process.cwd()

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('public invoice URL', () => {
  it('keeps a stable path per invoice number', () => {
    expect(PUBLIC_INVOICE_PATH_PREFIX).toBe('/i')
    expect(publicInvoicePath('INV-000768')).toBe('/i/INV-000768')
    expect(publicInvoicePath('inv-000768')).toBe('/i/INV-000768')
    expect(publicInvoiceUrl('https://devononsiterepairs.com', 'INV-000768'))
      .toBe('https://devononsiterepairs.com/i/INV-000768')
  })

  it('parses labeled and bare invoice numbers', () => {
    expect(parsePublicInvoiceSlug('INV-000768')).toBe(768)
    expect(parsePublicInvoiceSlug('inv-768')).toBe(768)
    expect(parsePublicInvoiceSlug('768')).toBe(768)
    expect(parsePublicInvoiceSlug('not-an-invoice')).toBeNull()
  })
})

describe('invoice support note when customer portal is off', () => {
  it('switches to Online Access with QR payload', () => {
    const note = buildInvoiceCustomerSupportNote({
      name: 'Devon Onsite Repairs INC',
      addressLine1: '',
      addressLine2: '',
      phone: '',
      email: 'accounting@devononsiterepairs.com',
      website: '',
    }, {
      customerPortalEnabled: false,
      onlineAccessUrl: 'https://devononsiterepairs.com/i/INV-000768',
      qrDataUrl: 'data:image/png;base64,AAA',
    })

    expect(note.title).toBe('Online Access')
    expect(note.qrDataUrl).toContain('data:image/png')
    expect(note.qrUrl).toBe('https://devononsiterepairs.com/i/INV-000768')
    expect(note.lines.some(line => line.includes('Scan to view'))).toBe(true)
    expect(note.lines.at(-1)).toBe('https://devononsiterepairs.com/i/INV-000768')
  })

  it('keeps the portal copy when the portal is on', () => {
    const note = buildInvoiceCustomerSupportNote({
      name: 'Devon Onsite Repairs INC',
      addressLine1: '',
      addressLine2: '',
      phone: '',
      email: 'accounting@devononsiterepairs.com',
      website: '',
    }, 'https://devononsiterepairs.com/portal')

    expect(note.title).toBe('Questions, changes, or portal access')
    expect(note.qrDataUrl).toBeUndefined()
    expect(note.lines.some(line => line.includes('Customer portal:'))).toBe(true)
  })
})

describe('invoice templates render Online Access QR', () => {
  it('includes the QR block in every invoice blade with the support box', () => {
    const blades = [
      'services/laravel-pdf/resources/views/invoices/pdf.blade.php',
      'server/assets/invoice-blade-baseline.blade.php',
      ...readdirSync(join(root, 'server/assets/invoice-template-presets'))
        .filter(name => name.endsWith('.blade.php'))
        .map(name => `server/assets/invoice-template-presets/${name}`),
    ]

    for (const file of blades) {
      const html = source(file)
      expect(html, file).toContain("customerSupport']['qrDataUrl']")
      expect(html, file).toContain('online-access')
      expect(html, file).toContain('Online Access')
    }
  })

  it('builds PDF support from the portal setting and public invoice URL', () => {
    const pdf = source('server/services/invoice-pdf.service.ts')
    expect(pdf).toContain('buildInvoicePdfCustomerSupport')
    const templates = source('server/services/invoice-templates.service.ts')
    expect(templates).toContain('buildInvoicePdfCustomerSupport')
    const helper = source('server/services/invoice-online-access.service.ts')
    expect(helper).toContain('isCustomerPortalEnabled')
    expect(helper).toContain('publicInvoiceUrl')
    expect(helper).toContain('qrcode')
  })
})

describe('ungated invoice page', () => {
  it('is skipped by staff auth middleware and uses public APIs', () => {
    expect(source('app/middleware/access.global.ts')).toContain("to.path.startsWith('/i/')")
    const page = source('app/pages/i/[number].vue')
    expect(page).toContain('Online Access')
    expect(page).toContain('/api/public/invoices/')
    expect(page).toContain('Payment record')
    expect(page).toContain('Request change')
    expect(page).toContain('Request service')
  })
})
