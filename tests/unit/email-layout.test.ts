import { describe, expect, it } from 'vitest'
import {
  EMAIL_TOKENS,
  buildCustomerSupportNote,
  buildStyledEmail,
  emailButton,
  emailPanel,
  escapeHtml,
  wrapEmailHtml,
} from '../../server/mail/email-layout.mjs'

describe('email layout', () => {
  it('escapes HTML entities', () => {
    expect(escapeHtml(`<a href="x">O'Brien & Co</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Co&lt;/a&gt;',
    )
  })

  it('wraps content in the flat white notification layout', () => {
    const html = wrapEmailHtml({
      title: 'Portal access',
      preheader: 'Your password is ready',
      eyebrow: 'Portal access',
      headline: 'Portal access',
      lead: 'Your temporary password is ready.',
      bodyHtml: '<p>Hello</p>',
      appUrl: 'https://app.example.com',
      brand: {
        brandName: 'Acme Shop',
        brandLegal: 'Acme Shop LLC',
        brandTagline: 'Accounting workspace',
        logoUrl: 'https://app.example.com/images/dorinc-icon-trans.png',
        logoInitial: 'A',
        addressLines: ['123 Main St', 'Austin, TX 78701'],
        phone: '5555550100',
        email: 'billing@acme.test',
        appUrl: 'https://app.example.com',
        settingsUrl: 'https://app.example.com/admin?tab=notifications',
        helpUrl: 'https://app.example.com/help',
        signInUrl: 'https://app.example.com/auth/login',
      },
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('background: #ffffff')
    expect(html).toContain(EMAIL_TOKENS.ink)
    expect(html).toContain('Portal access')
    expect(html).toContain('Your password is ready')
    expect(html).toContain('Acme Shop')
    expect(html).toContain('123 Main St')
    expect(html).toContain('(555) 555 0100')
    expect(html).toContain('Notification settings')
    expect(html).toContain('https://app.example.com')
  })

  it('builds styled email payloads with subject/text/html', () => {
    const mail = buildStyledEmail({
      subject: 'Test subject',
      text: 'Plain text body',
      eyebrow: 'Test',
      headline: 'Test title',
      lead: 'Supporting copy',
      details: [{ label: 'Email', value: 'a@b.com' }],
      primaryAction: { href: 'https://example.com/login', label: 'Sign in' },
      note: { title: 'Details', body: 'More info' },
      appUrl: 'https://example.com',
      brand: { brandName: 'DORINC', appUrl: 'https://example.com' },
    })

    expect(mail.subject).toBe('Test subject')
    expect(mail.text).toBe('Plain text body')
    expect(mail.html).toContain('Sign in')
    expect(mail.html).toContain('https://example.com/login')
    expect(mail.html).toContain('Details')
    expect(mail.html).toContain('a@b.com')
    expect(mail.html).toContain('class="button"')
    expect(mail.html).toContain('detail-label')
    expect(mail.html).not.toContain('mobile-block')
  })

  it('omits the footer completely when all footer content is disabled', () => {
    const html = wrapEmailHtml({
      bodyHtml: '<p>Hello</p>',
      footerNote: null,
      footerLinks: false,
      footerAddress: false,
      brand: {
        brandName: 'Acme Shop',
        brandLegal: 'Acme Shop LLC',
      },
    })

    expect(html).not.toContain('<!-- Footer -->')
    expect(html).not.toContain('Acme Shop LLC')
    expect(html).not.toContain('Notification settings')
  })

  it('builds customer support guidance from business settings email', () => {
    const note = buildCustomerSupportNote({
      email: 'billing@acme.test',
      appUrl: 'https://app.example.com',
      signInUrl: 'https://app.example.com/auth/login',
    }, 'https://app.example.com')

    expect(note.title).toContain('portal access')
    expect(note.text).toContain('billing@acme.test')
    expect(note.text).toContain('customer portal')
    expect(note.bodyHtml).toContain('mailto:billing@acme.test')
    expect(note.bodyHtml).toContain('card=customer')
  })

  it('still supports legacy body helpers', () => {
    const html = [
      emailButton('https://example.com', 'Go'),
      emailPanel('Panel', '<strong>OK</strong>'),
    ].join('')
    expect(html).toContain('Go')
    expect(html).toContain('Panel')
  })
})
