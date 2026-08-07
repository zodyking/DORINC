import { describe, expect, it } from 'vitest'
import { notificationSettingsSchema } from '../../shared/validators/workspace-settings'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTING_META,
  type NotificationToggleKey,
} from '../../shared/workspace-settings-defaults'

function booleanKeys(settings: typeof DEFAULT_NOTIFICATION_SETTINGS): NotificationToggleKey[] {
  return (Object.keys(settings) as Array<keyof typeof settings>).filter(
    key => typeof settings[key] === 'boolean',
  ) as NotificationToggleKey[]
}

describe('notification settings', () => {
  it('defaults toggles on and keeps a UTC send hour', () => {
    const parsed = notificationSettingsSchema.parse({})
    expect(parsed).toEqual(DEFAULT_NOTIFICATION_SETTINGS)
    expect(booleanKeys(parsed).every(key => parsed[key] === true)).toBe(true)
    expect(parsed.dailySummarySendHourUtc).toBe(13)
  })

  it('accepts partial updates merged by caller', () => {
    const parsed = notificationSettingsSchema.parse({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      staffLoginAlert: false,
      deletionRequestResult: false,
      dailySummarySendHourUtc: 7,
    })
    expect(parsed.staffLoginAlert).toBe(false)
    expect(parsed.deletionRequestResult).toBe(false)
    expect(parsed.invoiceEmail).toBe(true)
    expect(parsed.dailySummarySendHourUtc).toBe(7)
  })

  it('exposes metadata for every boolean toggle key', () => {
    const keys = booleanKeys(DEFAULT_NOTIFICATION_SETTINGS).sort()
    const metaKeys = NOTIFICATION_SETTING_META.map(m => m.key).sort()
    expect(metaKeys).toEqual(keys)
  })

  it('clamps daily summary send hour to 0–23', () => {
    expect(notificationSettingsSchema.parse({ dailySummarySendHourUtc: 0 }).dailySummarySendHourUtc).toBe(0)
    expect(notificationSettingsSchema.parse({ dailySummarySendHourUtc: 23 }).dailySummarySendHourUtc).toBe(23)
    expect(() => notificationSettingsSchema.parse({ dailySummarySendHourUtc: 24 })).toThrow()
  })
})
