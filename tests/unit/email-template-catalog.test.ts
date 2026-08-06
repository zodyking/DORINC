import { describe, expect, it } from 'vitest'
import {
  EMAIL_TEMPLATE_CATALOG,
  applyEmailTemplateContent,
  buildEmailTemplatePreviewDetails,
  getEmailTemplateDefinition,
  interpolateEmailTemplate,
  normalizeEmailTemplateContent,
  titleCaseEmailFieldLabel,
} from '../../shared/email-template-catalog'

describe('email template catalog', () => {
  it('includes core transactional email types', () => {
    const keys = EMAIL_TEMPLATE_CATALOG.map(t => t.typeKey)
    expect(keys).toContain('signup_verification')
    expect(keys).toContain('invoice_sent')
    expect(keys).toContain('estimate_sent')
    expect(keys).toContain('login_notification')
  })

  it('interpolates variables and normalizes content', () => {
    const def = getEmailTemplateDefinition('signup_verification')
    expect(def).toBeTruthy()
    const resolved = applyEmailTemplateContent(def!.defaults, {
      brandName: 'Acme Shop',
      name: 'Alex',
    })
    expect(resolved.lead).toContain('Acme Shop')
    expect(interpolateEmailTemplate('Hi {{name}}', { name: 'Pat' })).toBe('Hi Pat')
    const normalized = normalizeEmailTemplateContent({ subject: '  Custom  ' }, def!.defaults)
    expect(normalized.subject).toBe('Custom')
    expect(normalized.htmlSource).toBe('')
  })

  it('preserves raw htmlSource through normalize and interpolate', () => {
    const def = getEmailTemplateDefinition('invoice_sent')!
    const normalized = normalizeEmailTemplateContent({
      htmlSource: '<p>Invoice {{invoiceNumber}}</p>',
    }, def.defaults)
    expect(normalized.htmlSource).toContain('{{invoiceNumber}}')
    const resolved = applyEmailTemplateContent(normalized, { invoiceNumber: 'INV-1' })
    expect(resolved.htmlSource).toBe('<p>Invoice INV-1</p>')
  })

  it('title-cases field keys for readable email detail labels', () => {
    expect(titleCaseEmailFieldLabel('tempPassword')).toBe('Temporary Password')
    expect(titleCaseEmailFieldLabel('recipientName')).toBe('Recipient Name')
    expect(titleCaseEmailFieldLabel('dueDate')).toBe('Due Date')
    expect(titleCaseEmailFieldLabel('ipAddress')).toBe('IP Address')
  })

  it('builds preview details with Title Case labels and without brandName', () => {
    const portal = getEmailTemplateDefinition('portal_credentials')!
    const portalDetails = buildEmailTemplatePreviewDetails(portal)
    expect(portalDetails.map(row => row.label)).toEqual([
      'Customer Name',
      'Username',
      'Temporary Password',
    ])
    expect(portalDetails.some(row => /brand/i.test(row.label))).toBe(false)

    const reset = getEmailTemplateDefinition('password_reset')!
    const resetDetails = buildEmailTemplatePreviewDetails(reset)
    expect(resetDetails.map(row => row.label)).toEqual(['Name'])
    expect(resetDetails.some(row => /reset/i.test(row.label))).toBe(false)

    const invoice = getEmailTemplateDefinition('invoice_sent')!
    const invoiceDetails = buildEmailTemplatePreviewDetails(invoice)
    expect(invoiceDetails.map(row => row.label)).toEqual([
      'Customer Name',
      'Invoice Number',
      'Due Date',
      'Total',
    ])
  })

  it('keeps Title Case labels on every catalog variable', () => {
    for (const def of EMAIL_TEMPLATE_CATALOG) {
      for (const variable of def.variables) {
        expect(variable.label).toBe(titleCaseEmailFieldLabel(variable.label))
        expect(variable.label).not.toMatch(/^[a-z]+([A-Z]|$)/) // no camelCase / lowercase dump
      }
    }
  })
})
