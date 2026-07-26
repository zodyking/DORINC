import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearBannerDismissed,
  readBannerDismissed,
  writeBannerDismissed,
} from '../../shared/pwa-banner-dismissal'
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

describe('pwa banner dismissal', () => {
  let session: Map<string, string>

  beforeEach(() => {
    session = new Map<string, string>()
    const store = {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
    }
    clearBannerDismissed(store)
  })

  it('persists dismissal for the current session', () => {
    const store = {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
    }
    expect(readBannerDismissed(store)).toBe(false)
    writeBannerDismissed(store)
    expect(readBannerDismissed(store)).toBe(true)
  })

  it('clears dismissal on logout', () => {
    const store = {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
    }
    writeBannerDismissed(store)
    clearBannerDismissed(store)
    expect(readBannerDismissed(store)).toBe(false)
  })
})
