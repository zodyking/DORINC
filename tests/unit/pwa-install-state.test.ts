import { describe, expect, it } from 'vitest'
import { detectInstalledFromSignals, isInstalledWebAppPlatform } from '../../shared/pwa-install-detect'

describe('pwa install detection', () => {
  it('recognizes installed web app platforms', () => {
    expect(isInstalledWebAppPlatform('webapp')).toBe(true)
    expect(isInstalledWebAppPlatform('web_app')).toBe(true)
    expect(isInstalledWebAppPlatform('play')).toBe(false)
  })

  it('does not treat a stale cache hint as installed without browser confirmation', () => {
    expect(detectInstalledFromSignals({
      standalone: false,
      relatedApps: [],
      hasRelatedAppsApi: true,
    })).toBe(false)
  })

  it('marks installed when the browser reports a related web app', () => {
    expect(detectInstalledFromSignals({
      standalone: false,
      relatedApps: [{ platform: 'webapp' }],
      hasRelatedAppsApi: true,
    })).toBe(true)
  })

  it('treats standalone mode as installed even without related-apps support', () => {
    expect(detectInstalledFromSignals({
      standalone: true,
      relatedApps: null,
      hasRelatedAppsApi: false,
    })).toBe(true)
  })
})
