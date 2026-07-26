import { describe, expect, it } from 'vitest'
import { pwaInstallCopy } from '../../shared/pwa-install-copy'

describe('pwaInstallCopy', () => {
  it('uses desktop install copy with add button', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'desktop',
      installed: false,
      isIos: false,
    })
    expect(copy.title).toContain('desktop')
    expect(copy.actionLabel).toBe('Add to desktop')
    expect(copy.action).toBe('prompt')
  })

  it('uses home screen copy on mobile', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'mobile',
      installed: false,
      isIos: false,
    })
    expect(copy.title).toContain('home screen')
    expect(copy.actionLabel).toBe('Add to home screen')
  })

  it('uses share action on iOS', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'mobile',
      installed: false,
      isIos: true,
    })
    expect(copy.actionLabel).toBe('Add to home screen')
    expect(copy.action).toBe('share')
    expect(copy.fallbackSteps?.length).toBeGreaterThan(0)
  })

  it('shows a simple installed state without a button', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'desktop',
      installed: true,
      isIos: false,
    })
    expect(copy.variant).toBe('installed')
    expect(copy.title).toBe('Installed')
    expect(copy.actionLabel).toBeNull()
    expect(copy.message).toContain('desktop')
  })
})
