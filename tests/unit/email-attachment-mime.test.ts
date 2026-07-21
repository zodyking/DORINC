import { describe, expect, it } from 'vitest'
import {
  isInlineEmailPart,
  resolveAllowedAttachmentMime,
  resolveEmailAttachmentMime,
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

describe('resolveEmailAttachmentMime', () => {
  it('content-verifies images and PDFs via sniffed bytes', () => {
    expect(resolveEmailAttachmentMime('application/octet-stream', 'photo.jpg', 'image/jpeg', ALLOWED))
      .toBe('image/jpeg')
    expect(resolveEmailAttachmentMime('application/pdf', 'invoice.pdf', 'application/pdf', ALLOWED))
      .toBe('application/pdf')
  })

  it('accepts document types by declared MIME even without magic bytes', () => {
    expect(resolveEmailAttachmentMime(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'contract.docx',
      null,
      ALLOWED,
    )).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(resolveEmailAttachmentMime('text/csv', 'export.csv', null, ALLOWED)).toBe('text/csv')
  })

  it('falls back to the filename extension for generic declarations', () => {
    expect(resolveEmailAttachmentMime('application/octet-stream', 'sheet.xlsx', null, ALLOWED))
      .toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(resolveEmailAttachmentMime('application/octet-stream', 'archive.zip', null, ALLOWED))
      .toBe('application/zip')
  })

  it('never trusts image/PDF by extension when the bytes do not match', () => {
    expect(resolveEmailAttachmentMime('application/octet-stream', 'fake.pdf', null, ALLOWED))
      .toBeNull()
    expect(resolveEmailAttachmentMime('application/octet-stream', 'fake.png', 'text/plain', ALLOWED))
      .toBeNull()
  })

  it('rejects unsupported or unsafe types', () => {
    expect(resolveEmailAttachmentMime('text/html', 'evil.html', null, ALLOWED)).toBeNull()
    expect(resolveEmailAttachmentMime('image/svg+xml', 'evil.svg', null, ALLOWED)).toBeNull()
    expect(resolveEmailAttachmentMime('application/x-msdownload', 'evil.exe', null, ALLOWED)).toBeNull()
  })
})
