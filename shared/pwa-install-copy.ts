import type { PwaBrowser } from './pwa-browser-detect'
import { isIosBrowser } from './pwa-browser-detect'

export type PwaDeviceKind = 'desktop' | 'mobile'

export type PwaInstallVariant = 'install' | 'installed'

export type PwaInstallAction = 'prompt' | 'show-steps' | null

export interface PwaInstallCopyInput {
  deviceKind: PwaDeviceKind
  installed: boolean
  browser: PwaBrowser
}

export interface PwaInstallCopy {
  variant: PwaInstallVariant
  title: string
  message: string
  actionLabel: string | null
  action: PwaInstallAction
  fallbackSteps: string[] | null
}

function stepsForBrowser(browser: PwaBrowser): string[] {
  switch (browser) {
    case 'ios-safari':
      return [
        'If Share is not visible, tap the ••• More button at the bottom-right of Safari, then tap Share (square with arrow up).',
        'If Add to Home Screen is not listed, tap View More (▼) at the bottom of the share sheet.',
        'Tap Add to Home Screen, leave Open as Web App turned on, then tap Add.',
      ]
    case 'ios-chrome':
      return [
        'In Chrome, tap Share to the right of the address bar (square with arrow up).',
        'Scroll the share sheet and tap Add to Home Screen.',
        'Confirm the name, leave Open as Web App on if shown, then tap Add.',
      ]
    case 'ios-edge':
      return [
        'In Edge, tap Share in the address bar (square with arrow up).',
        'Scroll the share sheet and tap Add to Home Screen.',
        'Confirm the name, leave Open as Web App on if shown, then tap Add.',
      ]
    case 'ios-firefox':
      return [
        'In Firefox, tap the Share button in the toolbar (square with arrow up).',
        'Scroll the share sheet and tap Add to Home Screen.',
        'Confirm the name, leave Open as Web App on if shown, then tap Add.',
      ]
    case 'ios-other':
      return [
        'Open your browser\'s Share menu (usually a square with an arrow up).',
        'Scroll the share sheet and tap Add to Home Screen.',
        'Confirm the name, leave Open as Web App on if shown, then tap Add.',
      ]
    case 'android-chrome':
    case 'android-edge':
    case 'android-other':
      return [
        'If an Install app banner appears at the bottom, tap it. Otherwise tap the ⋮ menu (top-right).',
        'Tap Install app or Add to Home screen.',
        'Confirm Add — DORINC will appear on your home screen.',
      ]
    case 'android-samsung':
      return [
        'Tap the ☰ menu at the bottom-right of Samsung Internet.',
        'Tap Add page to, then Home screen.',
        'Confirm Add — DORINC will appear on your home screen.',
      ]
    case 'android-firefox':
      return [
        'Tap the ⋮ menu at the bottom-right of Firefox.',
        'Tap Install or Add to Home screen.',
        'Confirm Add — a shortcut will appear on your home screen.',
      ]
    case 'desktop-chrome':
    case 'desktop-other':
      return [
        'Click the install icon in Chrome\'s address bar (monitor with down arrow), or open ⋮ → Cast, save, and share → Install page as app….',
        'Confirm Install — DORINC opens in its own window.',
        'Pin it to your taskbar or Start menu for quick access.',
      ]
    case 'desktop-edge':
      return [
        'Click the App available icon in Edge\'s address bar, or open ⋯ → Apps → Install this site as an app.',
        'Confirm Install — DORINC opens in its own window.',
        'Pin it to your taskbar or Start menu for quick access.',
      ]
    case 'desktop-safari':
      return [
        'In Safari on macOS Sonoma (14) or later, open File → Add to Dock…, or click Share → Add to Dock.',
        'Confirm — DORINC will appear in your Dock and Launchpad.',
      ]
    case 'desktop-firefox':
      return [
        'Firefox on desktop does not support installing PWAs natively.',
        'Use Chrome or Edge for the best experience, or bookmark DORINC for quick access.',
      ]
  }
}

export function pwaInstallCopy(input: PwaInstallCopyInput): PwaInstallCopy {
  const { deviceKind, installed, browser } = input
  const isDesktop = deviceKind === 'desktop'
  const ios = isIosBrowser(browser)
  const steps = stepsForBrowser(browser)

  if (installed) {
    return {
      variant: 'installed',
      title: 'Installed',
      message: isDesktop
        ? 'DORINC is on your desktop — open it from your shortcut or taskbar.'
        : 'DORINC is on your home screen — open it like any other app.',
      actionLabel: null,
      action: null,
      fallbackSteps: null,
    }
  }

  if (ios) {
    return {
      variant: 'install',
      title: 'Add DORINC to your home screen',
      message: 'Tap the button below for step-by-step instructions in your current browser.',
      actionLabel: 'Add to home screen',
      action: 'show-steps',
      fallbackSteps: steps,
    }
  }

  if (isDesktop) {
    return {
      variant: 'install',
      title: 'Add DORINC to your desktop',
      message: browser === 'desktop-firefox'
        ? 'Tap the button below for instructions — Firefox cannot install PWAs directly.'
        : 'Install once for quick access from your desktop, taskbar, and Start menu.',
      actionLabel: 'Add to desktop',
      action: browser === 'desktop-firefox' ? 'show-steps' : 'prompt',
      fallbackSteps: steps,
    }
  }

  return {
    variant: 'install',
    title: 'Add DORINC to your home screen',
    message: 'Install for one-tap access in the shop.',
    actionLabel: 'Add to home screen',
    action: 'prompt',
    fallbackSteps: steps,
  }
}
