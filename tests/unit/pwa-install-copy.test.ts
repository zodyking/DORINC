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

  it('changes message after install on desktop', () => {
    const copy = pwaInstallCopy({
      deviceKind: 'desktop',
      installed: true,
      isIos: false,
      canPromptInstall: false,
    })
    expect(copy.title).toContain('desktop')
    expect(copy.message).toContain('shortcut')
  })
})
