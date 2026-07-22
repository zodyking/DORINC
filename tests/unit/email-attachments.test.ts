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

  it('recognizes BMP image attachments by their bytes', () => {
    expect(sniffMime(Buffer.from('BMxxxxxxxxxxxx', 'latin1'))).toBe('image/bmp')
  })

  it('recognizes AVIF image attachments by their ftyp brand', () => {
    const avif = Buffer.concat([
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('ftypavif', 'latin1'),
      Buffer.from('extra-data', 'latin1'),
    ])
    expect(sniffMime(avif)).toBe('image/avif')
  })
})
