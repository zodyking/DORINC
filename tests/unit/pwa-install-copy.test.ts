import { describe, expect, it } from 'vitest'
import { pwaInstallCopy } from '../../shared/pwa-install-copy'

describe('pwaInstallCopy', () => {
  it('uses desktop copy when install prompt is available', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'desktop',
      installed: false,
      isIos: false,
      canPromptInstall: true,
    })
    expect(copy.title).toContain('desktop')
    expect(copy.actionLabel).toBe('Add to desktop')
    expect(copy.variant).toBe('install')
  })

  it('uses home screen copy on mobile', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'mobile',
      installed: false,
      isIos: false,
      canPromptInstall: true,
    })
    expect(copy.title).toContain('home screen')
    expect(copy.actionLabel).toBe('Add to home screen')
  })

  it('returns iOS manual steps when prompt is unavailable', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'mobile',
      installed: false,
      isIos: true,
      canPromptInstall: false,
    })
    expect(copy.actionLabel).toBe('Show steps')
    expect(copy.steps?.length).toBeGreaterThan(0)
    expect(copy.steps?.[0]).toContain('Share')
  })

  it('shows a simple installed state without a button', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'desktop',
      installed: true,
      isIos: false,
      canPromptInstall: false,
    })
    expect(copy.variant).toBe('installed')
    expect(copy.title).toBe('Installed')
    expect(copy.actionLabel).toBeNull()
    expect(copy.message).toContain('desktop')
  })
})
