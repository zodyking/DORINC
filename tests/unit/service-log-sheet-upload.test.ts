import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('exports device confirm helpers for passwordless continue', async () => {
    const mod = await import('../../server/services/service-log-sheet-upload.service')
    expect(typeof mod.confirmSheetUploadDeviceUser).toBe('function')
    expect(typeof mod.findStaffUserForDevice).toBe('function')
  })
})

describe('service log sheet upload picker cards', () => {
  const page = readFileSync(resolve('app/pages/upload/service-log/sheet.vue'), 'utf8')

  it('shows only the customer name on picker cards', () => {
    expect(page).toContain('c.displayName')
    expect(page).not.toContain("c.accountKind === 'fleet' ? 'Fleet' : 'Individual'")
    expect(page).toContain('align-items: center')
    expect(page).toContain('text-align: center')
    expect(page).toContain('justify-content: center')
  })

  it('keeps vehicle and customer pick cards compact instead of stretching', () => {
    expect(page).toContain('grid-auto-rows: min-content')
    expect(page).toContain('align-content: start')
    expect(page).toContain('min-height: 56px')
    expect(page).toContain('height: auto')
    expect(page).toContain('vehicleTag(v)')
    expect(page).toContain('vehicleSub(v)')
  })
})
