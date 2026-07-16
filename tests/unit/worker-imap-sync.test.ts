import { describe, expect, it } from 'vitest'
import {
  buildReferences,
  generateInternetMessageId,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../../server/workers/lib/email-thread.mjs'
import {
  safeAttachmentName,
  sniffAttachmentMime,
} from '../../server/workers/lib/imap-inbox-sync.mjs'

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
})
