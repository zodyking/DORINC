import { describe, expect, it } from 'vitest'
import {
  SERVICE_LOG_SHEET_UPLOAD_HELP,
  SERVICE_LOG_SHEET_UPLOAD_PATH,
  SERVICE_LOG_SHEET_UPLOAD_TITLE,
  isServiceLogSheetUploadPath,
  serviceLogSheetUploadUrl,
} from '../../shared/service-log-sheet-upload'
import { defaultServiceLogSheetDocument } from '../../shared/service-log-sheet-default'
import { sheetRightTrailingVoid } from '../../shared/service-log-sheet-layout'
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

  it('keeps printed QR copy short and clear', () => {
    expect(SERVICE_LOG_SHEET_UPLOAD_TITLE).toBe('Scan to Upload')
    expect(SERVICE_LOG_SHEET_UPLOAD_HELP.toLowerCase()).toContain('invoice')
    expect(SERVICE_LOG_SHEET_UPLOAD_HELP.toLowerCase()).toContain('dorinc suite')
  })

  it('finds the empty right-column pocket under Inspection', () => {
    const voidInfo = sheetRightTrailingVoid(defaultServiceLogSheetDocument())
    expect(voidInfo).not.toBeNull()
    expect(voidInfo!.rowCount).toBeGreaterThanOrEqual(3)
  })

  it('allowlists the sheet upload path for post-login return', () => {
    expect(isAllowedStaffReturnPath('/upload/service-log/sheet')).toBe(true)
    expect(isAllowedStaffReturnPath('/dashboard')).toBe(false)
    expect(isAllowedStaffReturnPath('https://evil.example/upload/service-log/sheet')).toBe(false)
  })
})
