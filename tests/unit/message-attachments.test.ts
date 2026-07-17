import { describe, expect, it } from 'vitest'
import { assertValidDmAttachments } from '../../server/services/message-attachments.service'

describe('message attachments', () => {
  it('accepts common image mime types for team chat', () => {
    expect(() => assertValidDmAttachments([{
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      data: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    }])).not.toThrow()
  })

  it('rejects pdf uploads in team chat', () => {
    expect(() => assertValidDmAttachments([{
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from('%PDF-1.4'),
    }])).toThrow('INVALID_ATTACHMENT')
  })
})
