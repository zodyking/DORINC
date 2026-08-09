import { describe, expect, it } from 'vitest'
import {
  publicUploadPath,
  shouldDiscardUploadSessionServiceLog,
} from '../../server/services/service-log-upload.service'
import {
  SERVICE_LOG_MAX_PHOTOS,
  serviceLogNextPhotoPrompt,
  serviceLogPhotoCountLabel,
  serviceLogPhotoSlotLabel,
} from '../../shared/service-log-photos'
import { serviceLogUploadSessionCreateSchema } from '../../shared/validators/service-log-upload'

describe('service log upload session helpers', () => {
  it('builds a public upload path from the token', () => {
    expect(publicUploadPath('abc123')).toBe('/upload/service-log/abc123')
  })

  it('discards empty draft/uploaded logs when a QR session is cancelled', () => {
    expect(shouldDiscardUploadSessionServiceLog({ photoCount: 0, status: 'draft' })).toBe(true)
    expect(shouldDiscardUploadSessionServiceLog({ photoCount: 0, status: 'uploaded' })).toBe(true)
    expect(shouldDiscardUploadSessionServiceLog({ photoCount: 1, status: 'draft' })).toBe(false)
    expect(shouldDiscardUploadSessionServiceLog({ photoCount: 0, status: 'ready_for_review' })).toBe(false)
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
    expect(isPublicAppPath('/upload/service-log/sheet')).toBe(true)
    expect(isProtectedAppPath('/upload/service-log/tok')).toBe(false)
    expect(isProtectedAppPath('/invoices/new')).toBe(true)
  })

  it('allows preparing a QR upload session without an invoice draft id', () => {
    const parsed = serviceLogUploadSessionCreateSchema.parse({
      customerId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      technicianId: '33333333-3333-4333-8333-333333333333',
      serviceDate: '2026-08-09',
    })
    expect(parsed.invoiceId).toBeUndefined()
  })
})
