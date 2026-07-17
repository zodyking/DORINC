import { describe, expect, it } from 'vitest'
import {
  isInlineEmailPart,
  resolveAllowedAttachmentMime,
  resolveInlineImageMime,
} from '../../shared/email-attachment-mime'

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
])

describe('email-attachment-mime', () => {
  it('accepts sniffed mime when declared type is generic', () => {
    expect(resolveAllowedAttachmentMime('application/octet-stream', 'application/pdf', ALLOWED))
      .toBe('application/pdf')
    expect(resolveAllowedAttachmentMime('binary/octet-stream', 'image/png', ALLOWED))
      .toBe('image/png')
  })

  it('detects inline parts with content-disposition', () => {
    expect(isInlineEmailPart({
      related: false,
      contentDisposition: 'inline',
      cid: 'logo@mailer',
    })).toBe(true)
    expect(isInlineEmailPart({
      related: false,
      contentDisposition: 'attachment',
      cid: 'logo@mailer',
    })).toBe(false)
  })

  it('resolves inline image mime from generic declarations', () => {
    expect(resolveInlineImageMime('application/octet-stream', 'image/png', ALLOWED))
      .toBe('image/png')
    expect(resolveInlineImageMime('application/octet-stream', 'application/pdf', ALLOWED))
      .toBeNull()
  })
})
