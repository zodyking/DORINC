import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePublicInvoiceSlug,
  publicInvoicePath,
  publicInvoiceUrl,
  PUBLIC_INVOICE_PATH_PREFIX,
  slugifyPublicCustomerName,
} from '../../shared/public-invoice'
import { buildInvoiceCustomerSupportNote } from '../../shared/invoice-customer-support'
import {
  mintOnlineAccessToken,
  onlineAccessTokensMatch,
} from '../../server/services/invoice-online-access.service'

const root = process.cwd()
const sampleParts = {
  customerSlug: 'tomer-dvora',
  token: 'abcXYZ-_token',
  invoiceNumberFormatted: 'INV-000768',
}
const sampleUrl = 'https://devononsiterepairs.com/i/tomer-dvora/abcXYZ-_token/INV-000768'

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('public invoice URL', () => {
  it('builds a stable unguessable path from slug, token, and invoice number', () => {
    expect(PUBLIC_INVOICE_PATH_PREFIX).toBe('/i')
    expect(publicInvoicePath(sampleParts)).toBe('/i/tomer-dvora/abcXYZ-_token/INV-000768')
    expect(publicInvoiceUrl('https://devononsiterepairs.com', sampleParts)).toBe(sampleUrl)
    expect(slugifyPublicCustomerName('Tomer Dvora')).toBe('tomer-dvora')
    expect(slugifyPublicCustomerName('  ')).toBe('customer')
  })

  it('parses labeled and bare invoice numbers', () => {
    expect(parsePublicInvoiceSlug('INV-000768')).toBe(768)
    expect(parsePublicInvoiceSlug('inv-768')).toBe(768)
    expect(parsePublicInvoiceSlug('768')).toBe(768)
    expect(parsePublicInvoiceSlug('not-an-invoice')).toBeNull()
  })

  it('mints a stable-length token and compares it in constant time', () => {
    const token = mintOnlineAccessToken()
    expect(token.length).toBeGreaterThanOrEqual(20)
    expect(onlineAccessTokensMatch(token, token)).toBe(true)
    expect(onlineAccessTokensMatch(token, `${token}x`)).toBe(false)
    expect(onlineAccessTokensMatch(token, mintOnlineAccessToken())).toBe(false)
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
      onlineAccessUrl: sampleUrl,
      qrDataUrl: 'data:image/png;base64,AAA',
    })

    expect(note.title).toBe('Online Access')
    expect(note.qrDataUrl).toContain('data:image/png')
    expect(note.qrUrl).toBe(sampleUrl)
    expect(note.lines.some(line => line.includes('Scan to view'))).toBe(true)
    expect(note.lines.at(-1)).toBe(sampleUrl)
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
    expect(helper).toContain('mintOnlineAccessToken')
    expect(helper).not.toContain('publicInvoiceUrl(getAppUrl(), formatInvoiceNumber')
  })
})

describe('ungated invoice page', () => {
  it('is skipped by staff auth middleware and uses tokenized public APIs', () => {
    expect(source('app/middleware/access.global.ts')).toContain("to.path.startsWith('/i/')")
    const page = source('app/pages/i/[customer]/[token]/[number].vue')
    expect(page).toContain('Online Access')
    expect(page).toContain('/api/public/i/')
    expect(page).toContain('Request change')
    expect(page).toContain('Request service')
    expect(page).toContain('Billing question')
    expect(page).not.toContain('/api/public/invoices/')
    expect(page).not.toContain('vehicle.vin')
    expect(existsSync(join(root, 'app/pages/i/[number].vue'))).toBe(false)
    expect(existsSync(join(root, 'server/api/public/invoices/[number].get.ts'))).toBe(false)
    expect(existsSync(join(root, 'server/api/public/i/[customer]/[token]/[number].get.ts'))).toBe(true)
  })

  it('requires slug and token on public invoice APIs', () => {
    const api = source('server/api/public/i/[customer]/[token]/[number].get.ts')
    expect(api).toContain('publicInvoiceAccessParamSchema')
    expect(api).toContain('requirePublicInvoiceAccess')
    const service = source('server/services/public-invoice.service.ts')
    expect(service).toContain('onlineAccessTokensMatch')
    expect(service).toContain('publicInvoiceSlugsMatch')
  })
})

describe('invoice send when portal is off', () => {
  it('points the customer email at the public page instead of the portal', () => {
    const send = source('server/services/invoice-send.service.ts')
    expect(send).toContain('isCustomerPortalEnabled')
    expect(send).toContain('resolveInvoiceOnlineAccessLink')
    expect(send).toContain("portalEnabled ? 'portal' : 'online'")

    const templates = source('server/mail/customer-email-templates.ts')
    expect(templates).toContain('View invoice online')
    expect(templates).toContain("customerPortalEnabled === false ? 'online' : 'portal'")
  })
})
