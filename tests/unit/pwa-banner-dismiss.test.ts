import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPwaBannerDismissed,
  markPwaBannerDismissed,
  readPwaBannerDismissed,
} from '../../app/utils/pwa-install-state'

describe('PWA banner session dismiss', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
    clearPwaBannerDismissed()
  })

  it('starts undismissed and persists dismiss for the session', () => {
    expect(readPwaBannerDismissed()).toBe(false)
    markPwaBannerDismissed()
    expect(readPwaBannerDismissed()).toBe(true)
  })

  it('clears dismiss state on logout/new session', () => {
    markPwaBannerDismissed()
    clearPwaBannerDismissed()
    expect(readPwaBannerDismissed()).toBe(false)
  })
})
