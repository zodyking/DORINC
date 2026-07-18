import { describe, expect, it } from 'vitest'
import {
  buildNotificationSendMailOptions,
  extractSmtpDomain,
  generateNotificationMessageId,
  prepareNotificationPlainText,
  sanitizeNotificationHtml,
} from '../../server/mail/outbound-notification-mail.mjs'

describe('outbound-notification-mail', () => {
  it('generates unique standalone Message-IDs from the SMTP domain', () => {
    expect(extractSmtpDomain('Shop <billing@example.com>')).toBe('example.com')
    const first = generateNotificationMessageId('billing@example.com')
    const second = generateNotificationMessageId('billing@example.com')
    expect(first).toMatch(/^<notification\.[0-9a-f-]+@example\.com>$/)
    expect(second).not.toBe(first)
  })

  it('strips leading quote markers from plain text', () => {
    expect(prepareNotificationPlainText('> quoted line\n\nBody text')).toBe('quoted line\n\nBody text')
  })

  it('removes quoted-reply containers and injects a uniqueness marker', () => {
    const html = `<!doctype html><html><body><blockquote><p>Old</p></blockquote><p>Hello</p></body></html>`
    const out = sanitizeNotificationHtml(html)
    expect(out).not.toContain('<blockquote')
    expect(out).toContain('<!-- dorinc-notification:')
    expect(out).toContain('<p>Hello</p>')
  })

  it('builds notification send options without reply headers', () => {
    const options = buildNotificationSendMailOptions({
      from: 'billing@example.com',
      to: 'customer@example.com',
      subject: 'Invoice INV-000711 Is Ready',
      text: 'Hello',
      html: '<p>Hello</p>',
      messageId: '<notification.test@example.com>',
      attachments: [{
        filename: 'logo.png',
        content: Buffer.from('png'),
        contentType: 'image/png',
        cid: 'logo@dorinc',
      }],
    })

    expect(options.messageId).toBe('<notification.test@example.com>')
    expect(options.inReplyTo).toBeUndefined()
    expect(options.references).toBeUndefined()
    expect(options.headers?.['X-DORINC-Notification']).toBe('transactional')
    expect(options.attachments?.[0]?.contentDisposition).toBe('inline')
  })
})
