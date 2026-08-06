import { describe, expect, it } from 'vitest'
import {
  EMAIL_TEMPLATE_CATALOG,
  applyEmailTemplateContent,
  getEmailTemplateDefinition,
  interpolateEmailTemplate,
  normalizeEmailTemplateContent,
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
})
