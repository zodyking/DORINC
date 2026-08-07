import { describe, expect, it } from 'vitest'
import { publicUploadPath } from '../../server/services/service-log-upload.service'
import {
  SERVICE_LOG_MAX_PHOTOS,
  serviceLogNextPhotoPrompt,
  serviceLogPhotoCountLabel,
  serviceLogPhotoSlotLabel,
} from '../../shared/service-log-photos'

describe('service log upload session helpers', () => {
  it('builds a public upload path from the token', () => {
    expect(publicUploadPath('abc123')).toBe('/upload/service-log/abc123')
  })

  it('limits service log captures to front and back', () => {
    expect(SERVICE_LOG_MAX_PHOTOS).toBe(2)
    expect(serviceLogPhotoSlotLabel(0)).toBe('Front')
    expect(serviceLogPhotoSlotLabel(1)).toBe('Back')
    expect(serviceLogNextPhotoPrompt(0)).toMatch(/front/i)
    expect(serviceLogNextPhotoPrompt(1)).toMatch(/back/i)
    expect(serviceLogPhotoCountLabel(2)).toMatch(/front & back/i)
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
