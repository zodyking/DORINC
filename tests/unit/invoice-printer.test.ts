import { describe, expect, it } from 'vitest'
import {
  EMAIL_PRINT_MAX_ATTACHMENTS,
  EMAIL_PRINT_MAX_BYTES,
  fitEmailPrintAttachments,
  isValidPrinterEmail,
  normalizePrinterEmail,
  parsePrintToPrinterArgs,
  shouldAttachBlankServiceLog,
  totalAttachmentBytes,
} from '../../shared/invoice-printer'
import { invoiceWorkspaceSettingsSchema } from '../../shared/validators/workspace-settings'
import { DEFAULT_INVOICE_SETTINGS } from '../../shared/workspace-settings-defaults'
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)

function source(path: string): string {
  return readFileSync(new URL(path, root), 'utf8')
}

describe('email-to-print helpers', () => {
  it('normalizes and validates printer emails', () => {
    expect(normalizePrinterEmail('  Printer@Shop.Example  ')).toBe('printer@shop.example')
    expect(isValidPrinterEmail('printer@shop.example')).toBe(true)
    expect(isValidPrinterEmail('')).toBe(false)
    expect(isValidPrinterEmail('not-an-email')).toBe(false)
  })

  it('attaches a blank service log on every Nth invoice print', () => {
    expect(shouldAttachBlankServiceLog(1, 1)).toBe(true)
    expect(shouldAttachBlankServiceLog(2, 1)).toBe(true)
    expect(shouldAttachBlankServiceLog(1, 2)).toBe(false)
    expect(shouldAttachBlankServiceLog(2, 2)).toBe(true)
    expect(shouldAttachBlankServiceLog(3, 2)).toBe(false)
    expect(shouldAttachBlankServiceLog(3, 3)).toBe(true)
    expect(shouldAttachBlankServiceLog(0, 1)).toBe(false)
  })

  it('fits attachments to Brother Email Print limits (10 files, 20 MB)', () => {
    const pdf = (name: string, bytes: number) => ({
      filename: name,
      content: Buffer.alloc(bytes),
    })
    expect(fitEmailPrintAttachments([
      pdf('a.pdf', 100),
      pdf('b.pdf', 200),
    ])).toHaveLength(2)
    expect(fitEmailPrintAttachments([
      pdf('invoice.pdf', 100),
      pdf('blank-service-log.pdf', EMAIL_PRINT_MAX_BYTES),
    ]).map(a => a.filename)).toEqual(['invoice.pdf'])
    expect(fitEmailPrintAttachments([
      pdf('huge.pdf', EMAIL_PRINT_MAX_BYTES + 1),
    ])).toHaveLength(0)
    const many = Array.from({ length: EMAIL_PRINT_MAX_ATTACHMENTS + 3 }, (_, i) => pdf(`${i}.pdf`, 10))
    expect(fitEmailPrintAttachments(many)).toHaveLength(EMAIL_PRINT_MAX_ATTACHMENTS)
    expect(totalAttachmentBytes(fitEmailPrintAttachments([
      pdf('a.pdf', 5 * 1024 * 1024),
      pdf('b.pdf', 5 * 1024 * 1024),
    ]))).toBe(10 * 1024 * 1024)
  })

  it('parses print_to_printer args including string booleans', () => {
    expect(parsePrintToPrinterArgs({
      invoiceId: '  abc  ',
      query: '713',
      includeServiceLog: 'true',
      serviceLogOnly: 'false',
    })).toEqual({
      invoiceId: 'abc',
      query: '713',
      includeServiceLog: true,
      serviceLogOnly: false,
    })
    expect(parsePrintToPrinterArgs({ serviceLogOnly: true })).toMatchObject({
      serviceLogOnly: true,
    })
  })
})

describe('invoice workspace printer settings schema', () => {
  it('defaults printer fields off with an empty email', () => {
    const parsed = invoiceWorkspaceSettingsSchema.parse({
      ...DEFAULT_INVOICE_SETTINGS,
    })
    expect(parsed.autoPrintOnSend).toBe(false)
    expect(parsed.printerEmail).toBe('')
    expect(parsed.printBlankServiceLogAfterInvoice).toBe(false)
    expect(parsed.blankServiceLogEveryNInvoices).toBe(1)
  })

  it('requires a valid printer email when a print toggle is on', () => {
    expect(() => invoiceWorkspaceSettingsSchema.parse({
      ...DEFAULT_INVOICE_SETTINGS,
      autoPrintOnSend: true,
      printerEmail: '',
    })).toThrow(/printer email/i)

    expect(() => invoiceWorkspaceSettingsSchema.parse({
      ...DEFAULT_INVOICE_SETTINGS,
      printBlankServiceLogAfterInvoice: true,
      printerEmail: 'not-valid',
    })).toThrow(/valid printer email/i)

    const ok = invoiceWorkspaceSettingsSchema.parse({
      ...DEFAULT_INVOICE_SETTINGS,
      autoPrintOnSend: true,
      printBlankServiceLogAfterInvoice: true,
      printerEmail: 'printer@shop.example',
      blankServiceLogEveryNInvoices: 3,
    })
    expect(ok.blankServiceLogEveryNInvoices).toBe(3)
    expect(ok.printerEmail).toBe('printer@shop.example')
  })
})

describe('invoice settings email-to-print UI', () => {
  it('exposes auto-print, printer email, and service-log cadence controls', () => {
    const panel = source('app/components/admin/settings/SettingsInvoicePanel.vue')
    expect(panel).toContain('Auto print on send')
    expect(panel).toContain('Printer email address')
    expect(panel).toContain('Print blank service log after invoices')
    expect(panel).toContain('Blank service log frequency')
    expect(panel).toContain('form.autoPrintOnSend')
    expect(panel).toContain('form.printerEmail')
    expect(panel).toContain('form.printBlankServiceLogAfterInvoice')
    expect(panel).toContain('form.blankServiceLogEveryNInvoices')
  })

  it('hooks auto print into invoice send after the customer email is queued', () => {
    const send = source('server/services/invoice-send.service.ts')
    expect(send).toContain('maybeAutoPrintInvoiceOnSend')
  })

  it('sends attachment-only printer mail with no subject or body', () => {
    const printer = source('server/services/invoice-printer.service.ts')
    const mailer = source('server/mail/mailer.ts')
    const printerMailFn = mailer.slice(
      mailer.indexOf('export async function sendPrinterMail'),
      mailer.indexOf('export async function sendMail'),
    )
    expect(printer).toContain('sendPrinterMail')
    expect(printer).toContain('fitEmailPrintAttachments')
    expect(printer).not.toContain('sendNotificationMail')
    expect(printerMailFn).toContain('subject: \'\'')
    expect(printerMailFn).not.toMatch(/\btext:/)
    expect(printerMailFn).not.toMatch(/\bhtml:/)
  })
})
