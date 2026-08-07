import { describe, expect, it } from 'vitest'

describe('platform-help service module load', () => {
  it('imports without ReferenceError (BRAND_NAME must be defined)', async () => {
    const mod = await import('../../server/services/platform-help.service')
    expect(typeof mod.askPlatformHelp).toBe('function')
    expect(typeof mod.getPlatformHelpStatus).toBe('function')
  })
})
