export type PwaDeviceKind = 'desktop' | 'mobile'

export interface PwaInstallCopyInput {
  deviceKind: PwaDeviceKind
  installed: boolean
  isIos: boolean
  canPromptInstall: boolean
}

export interface PwaInstallCopy {
  title: string
  message: string
  actionLabel: string
  steps: string[] | null
}

export function pwaInstallCopy(input: PwaInstallCopyInput): PwaInstallCopy {
  const { deviceKind, installed, isIos, canPromptInstall } = input
  const isDesktop = deviceKind === 'desktop'

  if (installed) {
    return {
      title: isDesktop ? 'Added to your desktop' : 'Added to your home screen',
      message: isDesktop
        ? 'Launch DORINC anytime from your desktop shortcut or taskbar.'
        : 'Open DORINC from your home screen like any other app.',
      actionLabel: isDesktop ? 'Open app' : 'Got it',
      steps: null,
    }
  }

  if (canPromptInstall) {
    return {
      title: isDesktop ? 'Add DORINC to your desktop' : 'Add DORINC to your home screen',
      message: isDesktop
        ? 'Install once for quick access from your desktop, taskbar, and Start menu — no browser tabs needed.'
        : 'Install for one-tap access in the shop. Works offline for pages you have already opened.',
      actionLabel: isDesktop ? 'Add to desktop' : 'Add to home screen',
      steps: null,
    }
  }

  if (isIos) {
    return {
      title: 'Add DORINC to your home screen',
      message: 'Safari does not show an install button here — follow these quick steps instead.',
      actionLabel: 'Show steps',
      steps: [
        'Tap the Share button at the bottom of Safari.',
        'Scroll down and tap Add to Home Screen.',
        'Tap Add in the top right corner.',
      ],
    }
  }

  if (isDesktop) {
    return {
      title: 'Add DORINC to your desktop',
      message: 'Use your browser install option — look for the install icon near the address bar or in the browser menu.',
      actionLabel: 'Show steps',
      steps: [
        'In Chrome or Edge, click the install icon in the address bar (or ⋮ menu → Install app).',
        'Confirm Install — DORINC will open in its own window.',
        'Pin it to your taskbar or desktop from the Start menu.',
      ],
    }
  }

  return {
    title: 'Add DORINC to your home screen',
    message: 'Use your browser menu to install the app on this phone.',
    actionLabel: 'Show steps',
    steps: [
      'Open the browser menu (⋮ on Chrome, or Share on some browsers).',
      'Tap Install app or Add to Home screen.',
      'Confirm — DORINC will appear on your home screen.',
    ],
  }
}
