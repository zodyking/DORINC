import { describe, expect, it } from 'vitest'
import {
  SERVICE_LOG_SHEET_UPLOAD_PATH,
  isServiceLogSheetUploadPath,
  serviceLogSheetUploadUrl,
} from '../../shared/service-log-sheet-upload'
import {
  isAllowedStaffReturnPath,
} from '../../app/utils/staff-return-path'

describe('service log sheet upload QR landing', () => {
  it('builds a stable public upload URL', () => {
    expect(SERVICE_LOG_SHEET_UPLOAD_PATH).toBe('/upload/service-log/sheet')
    expect(serviceLogSheetUploadUrl('https://app.example.com/')).toBe(
      'https://app.example.com/upload/service-log/sheet',
    )
    expect(isServiceLogSheetUploadPath('/upload/service-log/sheet')).toBe(true)
    expect(isServiceLogSheetUploadPath('/upload/service-log/sheet?x=1')).toBe(true)
    expect(isServiceLogSheetUploadPath('/upload/service-log/abc')).toBe(false)
  })

  it('allowlists the sheet upload path for post-login return', () => {
    expect(isAllowedStaffReturnPath('/upload/service-log/sheet')).toBe(true)
    expect(isAllowedStaffReturnPath('/dashboard')).toBe(false)
    expect(isAllowedStaffReturnPath('https://evil.example/upload/service-log/sheet')).toBe(false)
  })
})
