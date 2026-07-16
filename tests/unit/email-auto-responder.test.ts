import { describe, expect, it } from 'vitest'
import { buildCustomerAutoResponderEmail } from '../../server/mail/templates/system.mjs'
import { shouldSkipAutoResponder } from '../../server/services/email-auto-responder.service'

describe('customer auto-responder', () => {
  const brand = {
    brandName: 'Acme Shop',
    brandLegal: 'Acme Shop LLC',
    brandTagline: 'Accounting workspace',
    logoUrl: 'https://app.example.com/images/dorinc-icon-trans.png',
    logoInitial: 'A',
    appUrl: 'https://app.example.com',
  }

  it('builds a branded HTML auto-responder template', () => {
    const mail = buildCustomerAutoResponderEmail({
      recipientName: 'Pat',
      subject: 'Re: Service question',
      message: 'Thanks for reaching out.\n\nWe will reply soon.',
      appUrl: brand.appUrl,
      brand,
    })
    expect(mail.subject).toBe('Re: Service question')
    expect(mail.html).toContain('We got your email')
    expect(mail.html).toContain('Thanks for reaching out.')
    expect(mail.text).toContain('Pat')
  })

  it('skips automated inbound messages', () => {
    expect(shouldSkipAutoResponder({ autoSubmitted: 'auto-replied' })).toBe(true)
    expect(shouldSkipAutoResponder({ subject: 'Out of office reply' })).toBe(true)
    expect(shouldSkipAutoResponder({ subject: 'Question about invoice' })).toBe(false)
  })
})
