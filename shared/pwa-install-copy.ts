import type { PwaBrowser } from './pwa-browser-detect'
import { isIosBrowser } from './pwa-browser-detect'

export type PwaDeviceKind = 'desktop' | 'mobile'

export type PwaInstallVariant = 'install' | 'installed'

export type PwaInstallAction = 'prompt' | 'show-steps' | null

export interface PwaInstallStep {
  text: string
  image?: string
  imageAlt?: string
}

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
  steps: PwaInstallStep[] | null
  stepsExpandedByDefault: boolean
}

const IOS_SAFARI_STEPS: PwaInstallStep[] = [
  {
    text: 'Open DORINC in Safari. In-app browsers (Messages, Mail, etc.) cannot install PWAs — copy the link into Safari if needed.',
    image: '/pwa-guide/ios-safari-open.svg',
    imageAlt: 'Safari browser with the DORINC address in the URL bar',
  },
  {
    text: 'In Compact Mode (Safari default), tap the ••• More button at the bottom-right. If you already see a Share icon in the toolbar, skip to the next step.',
    image: '/pwa-guide/ios-safari-more-menu.svg',
    imageAlt: 'Safari bottom toolbar with the More menu button highlighted',
  },
  {
    text: 'Tap the Share button — a square with an arrow pointing up. In landscape it appears at the top-right; in Bottom/Top toolbar modes it sits in the center of the bar.',
    image: '/pwa-guide/ios-safari-share.svg',
    imageAlt: 'Safari Share button highlighted in the toolbar',
  },
  {
    text: 'If you do not see Add to Home Screen, tap View More (▼) at the bottom of the share sheet to expand the full action list.',
    image: '/pwa-guide/ios-safari-view-more.svg',
    imageAlt: 'Share sheet with View More expanded to reveal additional actions',
  },
  {
    text: 'Scroll and tap Add to Home Screen (+ icon).',
    image: '/pwa-guide/ios-add-home-screen.svg',
    imageAlt: 'Share sheet showing the Add to Home Screen option',
  },
  {
    text: 'Leave Open as Web App turned ON so DORINC launches full-screen without Safari bars, then tap Add.',
    image: '/pwa-guide/ios-open-as-web-app.svg',
    imageAlt: 'Add to Home Screen dialog with Open as Web App enabled',
  },
]

const IOS_OTHER_BROWSER_STEPS: PwaInstallStep[] = [
  {
    text: 'Open DORINC in this browser (iOS 16.4+). For the most reliable install, use Safari — tap Share in Safari and choose Add to Home Screen.',
    image: '/pwa-guide/ios-safari-open.svg',
    imageAlt: 'Browser with the DORINC site open',
  },
  {
    text: 'Tap the Share or ••• menu button in the browser toolbar.',
    image: '/pwa-guide/ios-safari-share.svg',
    imageAlt: 'Browser toolbar Share button highlighted',
  },
  {
    text: 'Tap View More (▼) if Add to Home Screen is hidden, then select Add to Home Screen.',
    image: '/pwa-guide/ios-add-home-screen.svg',
    imageAlt: 'Share menu showing Add to Home Screen',
  },
  {
    text: 'Keep Open as Web App enabled and tap Add. The DORINC icon will appear on your Home Screen.',
    image: '/pwa-guide/ios-open-as-web-app.svg',
    imageAlt: 'Confirmation dialog with Open as Web App enabled',
  },
]

const ANDROID_CHROME_STEPS: PwaInstallStep[] = [
  {
    text: 'Open DORINC in Chrome. If an Install app banner appears at the bottom, tap it and skip to the last step.',
    image: '/pwa-guide/android-chrome-banner.svg',
    imageAlt: 'Chrome showing an Install app banner at the bottom of the screen',
  },
  {
    text: 'Otherwise tap the ⋮ three-dot menu in the top-right corner.',
    image: '/pwa-guide/android-chrome-menu.svg',
    imageAlt: 'Chrome menu button highlighted in the top-right corner',
  },
  {
    text: 'Tap Install app or Add to Home screen.',
    image: '/pwa-guide/android-install-app.svg',
    imageAlt: 'Chrome menu with Install app option highlighted',
  },
  {
    text: 'Confirm Add — DORINC will appear on your home screen and app drawer like a native app.',
    image: '/pwa-guide/android-confirm.svg',
    imageAlt: 'Install confirmation dialog with Add button',
  },
]

const ANDROID_SAMSUNG_STEPS: PwaInstallStep[] = [
  {
    text: 'Open DORINC in Samsung Internet.',
    image: '/pwa-guide/android-chrome-banner.svg',
    imageAlt: 'Samsung Internet with the DORINC site open',
  },
  {
    text: 'Tap the ☰ menu icon at the bottom-right.',
    image: '/pwa-guide/android-samsung-menu.svg',
    imageAlt: 'Samsung Internet menu button highlighted',
  },
  {
    text: 'Tap Add page to, then Home screen.',
    image: '/pwa-guide/android-install-app.svg',
    imageAlt: 'Samsung Internet menu showing Add page to Home screen',
  },
  {
    text: 'Confirm Add — the DORINC icon will appear on your home screen.',
    image: '/pwa-guide/android-confirm.svg',
    imageAlt: 'Add to Home screen confirmation dialog',
  },
]

const ANDROID_FIREFOX_STEPS: PwaInstallStep[] = [
  {
    text: 'Open DORINC in Firefox.',
    image: '/pwa-guide/android-chrome-banner.svg',
    imageAlt: 'Firefox with the DORINC site open',
  },
  {
    text: 'Tap the ⋮ menu at the bottom-right.',
    image: '/pwa-guide/android-chrome-menu.svg',
    imageAlt: 'Firefox menu button highlighted',
  },
  {
    text: 'Tap Install or Add to Home screen. Note: Firefox creates a shortcut that may open inside the browser rather than standalone.',
    image: '/pwa-guide/android-install-app.svg',
    imageAlt: 'Firefox menu with Add to Home screen option',
  },
  {
    text: 'Tap Add to place the shortcut on your home screen.',
    image: '/pwa-guide/android-confirm.svg',
    imageAlt: 'Add to Home screen confirmation dialog',
  },
]

const DESKTOP_CHROME_STEPS: PwaInstallStep[] = [
  {
    text: 'Look for the install icon in Chrome\'s address bar — a monitor with a down arrow (⊕ or ⬇). Click it and choose Install.',
    image: '/pwa-guide/desktop-chrome-install.svg',
    imageAlt: 'Chrome address bar with the install icon highlighted',
  },
  {
    text: 'If the icon is missing, open the ⋮ menu → Cast, save, and share → Install page as app… (or Install DORINC).',
    image: '/pwa-guide/desktop-chrome-menu.svg',
    imageAlt: 'Chrome menu showing Install page as app option',
  },
  {
    text: 'Confirm Install. DORINC opens in its own window — pin it from the taskbar or Start menu for quick access.',
    image: '/pwa-guide/desktop-confirm.svg',
    imageAlt: 'Desktop install confirmation dialog',
  },
]

const DESKTOP_EDGE_STEPS: PwaInstallStep[] = [
  {
    text: 'Look for the App available icon in Edge\'s address bar and click Install.',
    image: '/pwa-guide/desktop-edge-install.svg',
    imageAlt: 'Edge address bar with the app install icon highlighted',
  },
  {
    text: 'If the icon is missing, open the ⋯ menu → Apps → Install this site as an app.',
    image: '/pwa-guide/desktop-edge-menu.svg',
    imageAlt: 'Edge menu showing Install this site as an app',
  },
  {
    text: 'Confirm Install, then pin DORINC to your taskbar or Start menu from the app window.',
    image: '/pwa-guide/desktop-confirm.svg',
    imageAlt: 'Desktop install confirmation dialog',
  },
]

const DESKTOP_SAFARI_STEPS: PwaInstallStep[] = [
  {
    text: 'In Safari on macOS Sonoma (14) or later, open the File menu → Add to Dock…',
    image: '/pwa-guide/desktop-safari-menu.svg',
    imageAlt: 'Safari File menu with Add to Dock option',
  },
  {
    text: 'Or click the Share button in the toolbar and choose Add to Dock.',
    image: '/pwa-guide/desktop-safari-share.svg',
    imageAlt: 'Safari Share menu with Add to Dock option',
  },
  {
    text: 'Confirm — DORINC will appear in your Dock and Launchpad like a native app.',
    image: '/pwa-guide/desktop-confirm.svg',
    imageAlt: 'Add to Dock confirmation dialog',
  },
]

const DESKTOP_FIREFOX_STEPS: PwaInstallStep[] = [
  {
    text: 'Firefox on desktop does not support installing PWAs natively.',
    image: '/pwa-guide/desktop-firefox-note.svg',
    imageAlt: 'Firefox browser note about PWA support',
  },
  {
    text: 'Use Chrome or Edge for the best experience, or bookmark DORINC for quick access in Firefox.',
    image: '/pwa-guide/desktop-chrome-install.svg',
    imageAlt: 'Chrome install icon as an alternative browser option',
  },
]

function stepsForBrowser(browser: PwaBrowser): PwaInstallStep[] {
  switch (browser) {
    case 'ios-safari':
      return IOS_SAFARI_STEPS
    case 'ios-chrome':
    case 'ios-edge':
    case 'ios-firefox':
    case 'ios-other':
      return IOS_OTHER_BROWSER_STEPS
    case 'android-chrome':
    case 'android-edge':
    case 'android-other':
      return ANDROID_CHROME_STEPS
    case 'android-samsung':
      return ANDROID_SAMSUNG_STEPS
    case 'android-firefox':
      return ANDROID_FIREFOX_STEPS
    case 'desktop-chrome':
    case 'desktop-other':
      return DESKTOP_CHROME_STEPS
    case 'desktop-edge':
      return DESKTOP_EDGE_STEPS
    case 'desktop-safari':
      return DESKTOP_SAFARI_STEPS
    case 'desktop-firefox':
      return DESKTOP_FIREFOX_STEPS
  }
}

export function pwaInstallCopy(input: PwaInstallCopyInput): PwaInstallCopy {
  const { deviceKind, installed, browser } = input
  const isDesktop = deviceKind === 'desktop'
  const ios = isIosBrowser(browser)

  if (installed) {
    return {
      variant: 'installed',
      title: 'Installed',
      message: isDesktop
        ? 'DORINC is on your desktop — open it from your shortcut or taskbar.'
        : 'DORINC is on your home screen — open it like any other app.',
      actionLabel: null,
      action: null,
      steps: null,
      stepsExpandedByDefault: false,
    }
  }

  const steps = stepsForBrowser(browser)

  if (ios) {
    return {
      variant: 'install',
      title: 'Add DORINC to your home screen',
      message: browser === 'ios-safari'
        ? 'iPhone does not show an automatic install prompt. Follow the steps below in Safari — it only takes a few taps.'
        : 'Follow the steps below to add DORINC to your home screen. Safari is the most reliable option on iPhone.',
      actionLabel: 'Show steps',
      action: 'show-steps',
      steps,
      stepsExpandedByDefault: true,
    }
  }

  if (isDesktop && browser !== 'desktop-firefox') {
    return {
      variant: 'install',
      title: 'Add DORINC to your desktop',
      message: 'Install once for quick access from your desktop, taskbar, and Start menu.',
      actionLabel: 'Add to desktop',
      action: 'prompt',
      steps,
      stepsExpandedByDefault: false,
    }
  }

  if (isDesktop && browser === 'desktop-firefox') {
    return {
      variant: 'install',
      title: 'Add DORINC to your desktop',
      message: 'Firefox cannot install PWAs directly. Switch to Chrome or Edge, or follow the steps below.',
      actionLabel: 'Show steps',
      action: 'show-steps',
      steps,
      stepsExpandedByDefault: true,
    }
  }

  return {
    variant: 'install',
    title: 'Add DORINC to your home screen',
    message: 'Install for one-tap access in the shop.',
    actionLabel: browser === 'android-firefox' ? 'Show steps' : 'Add to home screen',
    action: browser === 'android-firefox' ? 'show-steps' : 'prompt',
    steps,
    stepsExpandedByDefault: browser === 'android-firefox',
  }
}
