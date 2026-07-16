import { describe, expect, it, vi } from 'vitest'
import {
  buildReferences,
  buildReplyThreadHeaders,
  generateInternetMessageId,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../../server/workers/lib/email-thread.mjs'
import {
  persistInboundAttachments,
  safeAttachmentName,
  sniffAttachmentMime,
} from '../../server/workers/lib/imap-attachments.mjs'

describe('worker email-thread helpers', () => {
  it('normalizes wrapped addresses', () => {
    expect(normalizeEmailAddress('Shop <billing@example.com>')).toBe('billing@example.com')
  })

  it('builds reply subject once', () => {
    expect(subjectWithRePrefix('Hello')).toBe('Re: Hello')
    expect(subjectWithRePrefix('Re: Hello')).toBe('Re: Hello')
  })

  it('builds references chain', () => {
    expect(buildReferences('<a@x.com>', '<b@y.com>')).toBe('<a@x.com> <b@y.com>')
  })

  it('keeps automatic replies in the inbound email thread', () => {
    expect(buildReplyThreadHeaders({
      subject: 'Service request',
      fallbackSubject: 'We received your message',
      parentMessageId: '<inbound@customer.test>',
      existingReferences: '<root@customer.test>',
    })).toEqual({
      subject: 'Re: Service request',
      inReplyTo: '<inbound@customer.test>',
      references: '<root@customer.test> <inbound@customer.test>',
    })
  })

  it('generates internet message ids', () => {
    expect(generateInternetMessageId('example.com')).toMatch(/^<.+@example\.com>$/)
  })
})

describe('worker IMAP attachment helpers', () => {
  it('recognizes supported attachment bytes', () => {
    expect(sniffAttachmentMime(Buffer.from('GIF89aimage-data', 'latin1'))).toBe('image/gif')
    expect(sniffAttachmentMime(Buffer.from('%PDF-1.7 test', 'latin1'))).toBe('application/pdf')
  })

  it('removes paths and control characters from attachment names', () => {
    expect(safeAttachmentName('../checks/check\r\n.pdf', 0)).toBe('check__.pdf')
  })

  it('persists inline related images and regular attachments separately', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT value FROM app_settings')) return { rows: [{ value: { mb: 25 } }] }
      if (sql.includes('COUNT(*)')) return { rows: [{ count: 0 }] }
      if (sql.includes('content_id FROM app_files')) return { rows: [] }
      return { rows: [] }
    })
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])
    const pdf = Buffer.from('%PDF-1.7 test', 'latin1')

    const count = await persistInboundAttachments({ query }, 'message-1', [
      { filename: 'inline.png', contentType: 'image/png', content: png, related: true, cid: 'logo@mailer' },
      { filename: 'check.pdf', contentType: 'application/pdf', content: pdf, related: false },
    ])

    expect(count).toBe(2)
    const inserts = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO app_files'))
    expect(inserts).toHaveLength(2)
    expect(inserts[0]?.[1]?.[1]).toBe('inline')
    expect(inserts[0]?.[1]?.[7]).toBe('logo@mailer')
    expect(inserts[1]?.[1]?.[1]).toBe('attachment')
  })
})
