import { describe, expect, it } from 'vitest'
import { safeAttachmentDownloadName } from '../../server/services/email-attachment.service'
import { sniffMime } from '../../server/services/files.service'

describe('email attachments', () => {
  it('sanitizes attachment names used in response headers', () => {
    expect(safeAttachmentDownloadName('check"\r\nmalicious.pdf')).toBe('check___malicious.pdf')
  })

  it('recognizes GIF image attachments by their bytes', () => {
    expect(sniffMime(Buffer.from('GIF89aimage-data', 'latin1'))).toBe('image/gif')
  })
})
