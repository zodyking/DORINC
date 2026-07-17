import { describe, expect, it } from 'vitest'
import { chatWorkspaceSettingsSchema } from '../../shared/validators/workspace-settings'
import { DEFAULT_CHAT_SETTINGS } from '../../shared/workspace-settings-defaults'

describe('chat workspace settings', () => {
  it('defaults direct messaging off', () => {
    const parsed = chatWorkspaceSettingsSchema.parse({})
    expect(parsed).toEqual(DEFAULT_CHAT_SETTINGS)
    expect(parsed.directMessagingEnabled).toBe(false)
  })

  it('accepts enabling direct messaging', () => {
    const parsed = chatWorkspaceSettingsSchema.parse({ directMessagingEnabled: true })
    expect(parsed.directMessagingEnabled).toBe(true)
  })
})
