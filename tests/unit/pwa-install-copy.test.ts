import { describe, expect, it } from 'vitest'
import { detectPwaBrowser } from '../../shared/pwa-browser-detect'
import { pwaInstallCopy } from '../../shared/pwa-install-copy'

describe('detectPwaBrowser', () => {
  it('detects iOS Safari', () => {
    expect(detectPwaBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('ios-safari')
  })

  it('detects iOS Chrome', () => {
    expect(detectPwaBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1')).toBe('ios-chrome')
  })

  it('detects Android Chrome', () => {
    expect(detectPwaBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36')).toBe('android-chrome')
  })

  it('detects desktop Edge', () => {
    expect(detectPwaBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0')).toBe('desktop-edge')
  })
})

describe('pwaInstallCopy', () => {
  it('uses desktop install copy with add button', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'desktop',
      installed: false,
      browser: 'desktop-chrome',
    })
    expect(copy.title).toContain('desktop')
    expect(copy.actionLabel).toBe('Add to desktop')
    expect(copy.action).toBe('prompt')
    expect(copy.fallbackSteps?.length).toBeGreaterThan(0)
  })

  it('uses home screen copy on mobile Android', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'mobile',
      installed: false,
      browser: 'android-chrome',
    })
    expect(copy.title).toContain('home screen')
    expect(copy.actionLabel).toBe('Add to home screen')
    expect(copy.action).toBe('prompt')
  })

  it('uses Chrome-specific steps on iOS Chrome', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'mobile',
      installed: false,
      browser: 'ios-chrome',
    })
    expect(copy.actionLabel).toBe('Add to home screen')
    expect(copy.action).toBe('show-steps')
    expect(copy.message).not.toContain('Safari is the most reliable')
    expect(copy.fallbackSteps?.[0]).toContain('Chrome')
    expect(copy.fallbackSteps?.[0]).toContain('Share')
  })

  it('uses Safari-specific steps on iOS Safari', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'mobile',
      installed: false,
      browser: 'ios-safari',
    })
    expect(copy.fallbackSteps?.[0]).toContain('Safari')
    expect(copy.fallbackSteps?.some(step => step.includes('View More'))).toBe(true)
  })

  it('shows a simple installed state without a button', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'desktop',
      installed: true,
      browser: 'desktop-chrome',
    })
    expect(copy.variant).toBe('installed')
    expect(copy.title).toBe('Installed')
    expect(copy.actionLabel).toBeNull()
    expect(copy.message).toContain('desktop')
  })
})
