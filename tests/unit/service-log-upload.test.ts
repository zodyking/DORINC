import { describe, expect, it } from 'vitest'
import { publicUploadPath } from '../../server/services/service-log-upload.service'

describe('service log upload session helpers', () => {
  it('builds a public upload path from the token', () => {
    expect(publicUploadPath('abc123')).toBe('/upload/service-log/abc123')
  })
})

describe('invoice wizard public upload auth path', () => {
  it('treats /upload/ as a public app path', async () => {
    const { isPublicAppPath, isProtectedAppPath } = await import('../../app/utils/auth-session')
    expect(isPublicAppPath('/upload/service-log/tok')).toBe(true)
    expect(isProtectedAppPath('/upload/service-log/tok')).toBe(false)
    expect(isProtectedAppPath('/invoices/new')).toBe(true)
  })
})
