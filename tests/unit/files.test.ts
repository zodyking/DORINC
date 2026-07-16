import { describe, expect, it } from 'vitest'
import { filePreviewUrl, isUserUploadFileKind, USER_UPLOAD_FILE_KINDS } from '../../shared/files'

describe('shared/files', () => {
  it('defines user upload kinds without derivatives', () => {
    expect(USER_UPLOAD_FILE_KINDS).toEqual(['original', 'attachment'])
    expect(isUserUploadFileKind('original')).toBe(true)
    expect(isUserUploadFileKind('attachment')).toBe(true)
    expect(isUserUploadFileKind('thumbnail')).toBe(false)
    expect(isUserUploadFileKind('preview')).toBe(false)
  })

  it('builds preview URLs', () => {
    expect(filePreviewUrl('abc-123')).toBe('/api/files/abc-123/preview')
  })
})
