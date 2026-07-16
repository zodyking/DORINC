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

  it('persists safe non-inline attachments and skips embedded images', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT value FROM app_settings')) return { rows: [{ value: { mb: 25 } }] }
      return { rows: [] }
    })
    const pdf = Buffer.from('%PDF-1.7 test', 'latin1')

    const count = await persistInboundAttachments({ query }, 'message-1', [
      { filename: 'inline.png', contentType: 'image/png', content: Buffer.from('x'), related: true },
      { filename: 'check.pdf', contentType: 'application/pdf', content: pdf, related: false },
    ])

    expect(count).toBe(1)
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO app_files'))
    expect(insert?.[1]?.[0]).toBe('message-1')
    expect(insert?.[1]?.[1]).toBe('check.pdf')
    expect(insert?.[1]?.[2]).toBe('application/pdf')
  })
})
