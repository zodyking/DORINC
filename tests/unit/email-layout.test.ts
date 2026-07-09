import { describe, expect, it } from 'vitest'
import {
  EMAIL_TOKENS,
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

  it('wraps content in a modern white card layout', () => {
    const html = wrapEmailHtml({
      title: 'Portal access',
      preheader: 'Your password is ready',
      bodyHtml: '<p>Hello</p>',
      appUrl: 'https://app.example.com',
    })

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('background:#ffffff')
    expect(html).toContain(EMAIL_TOKENS.bg)
    expect(html).toContain(EMAIL_TOKENS.accent)
    expect(html).toContain('Portal access')
    expect(html).toContain('Your password is ready')
    expect(html).toContain('DORINC')
    expect(html).toContain('https://app.example.com')
  })

  it('builds styled email payloads with subject/text/html', () => {
    const mail = buildStyledEmail({
      subject: 'Test subject',
      text: 'Plain text body',
      title: 'Test title',
      bodyHtml: [
        emailButton('https://example.com/login', 'Sign in'),
        emailPanel('Details', '<strong>Email:</strong> a@b.com'),
      ].join(''),
      appUrl: 'https://example.com',
    })

    expect(mail.subject).toBe('Test subject')
    expect(mail.text).toBe('Plain text body')
    expect(mail.html).toContain('Sign in')
    expect(mail.html).toContain('https://example.com/login')
    expect(mail.html).toContain('Details')
    expect(mail.html).toContain('a@b.com')
    expect(mail.html).toContain('border-radius:14px')
  })
})
