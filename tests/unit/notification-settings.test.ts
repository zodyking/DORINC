import { describe, expect, it } from 'vitest'
import { notificationSettingsSchema } from '../../shared/validators/workspace-settings'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTING_META,
} from '../../shared/workspace-settings-defaults'

describe('notification settings', () => {
  it('defaults all toggles on', () => {
    const parsed = notificationSettingsSchema.parse({})
    expect(parsed).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
    expect(Object.values(parsed).every(Boolean)).toBe(true)
  })

  it('accepts partial updates merged by caller', () => {
    const parsed = notificationSettingsSchema.parse({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      staffLoginAlert: false,
      deletionRequestResult: false,
    })
    expect(parsed.staffLoginAlert).toBe(false)
    expect(parsed.deletionRequestResult).toBe(false)
    expect(parsed.invoiceEmail).toBe(true)
  })

  it('exposes metadata for every toggle key', () => {
    const keys = Object.keys(DEFAULT_NOTIFICATION_SETTINGS).sort()
    const metaKeys = NOTIFICATION_SETTING_META.map(m => m.key).sort()
    expect(metaKeys).toEqual(keys)
  })
})
