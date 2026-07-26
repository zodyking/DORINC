export type PwaDeviceKind = 'desktop' | 'mobile'

export type PwaInstallVariant = 'install' | 'installed'

export type PwaInstallAction = 'prompt' | 'share' | 'steps' | null

export interface PwaInstallCopyInput {
  deviceKind: PwaDeviceKind
  installed: boolean
  isIos: boolean
  canPromptInstall: boolean
}

export interface PwaInstallCopy {
  variant: PwaInstallVariant
  title: string
  message: string
  actionLabel: string | null
  action: PwaInstallAction
  steps: string[] | null
}

export function pwaInstallCopy(input: PwaInstallCopyInput): PwaInstallCopy {
  const { deviceKind, installed, isIos, canPromptInstall } = input
  const isDesktop = deviceKind === 'desktop'

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
    }
  }

  if (canPromptInstall) {
    return {
      variant: 'install',
      title: isDesktop ? 'Add DORINC to your desktop' : 'Add DORINC to your home screen',
      message: isDesktop
        ? 'Install once for quick access from your desktop, taskbar, and Start menu — no browser tabs needed.'
        : 'Install for one-tap access in the shop. Works offline for pages you have already opened.',
      actionLabel: isDesktop ? 'Add to desktop' : 'Add to home screen',
      action: 'prompt',
      steps: null,
    }
  }

  if (isIos) {
    return {
      variant: 'install',
      title: 'Add DORINC to your home screen',
      message: 'Tap the button below, then choose Add to Home Screen in the menu that opens.',
      actionLabel: 'Add to home screen',
      action: 'share',
      steps: null,
    }
  }

  if (isDesktop) {
    return {
      variant: 'install',
      title: 'Add DORINC to your desktop',
      message: 'Use your browser install option — look for the install icon near the address bar or in the browser menu.',
      actionLabel: 'Show steps',
      action: 'steps',
      steps: [
        'In Chrome or Edge, click the install icon in the address bar (or ⋮ menu → Install app).',
        'Confirm Install — DORINC will open in its own window.',
        'Pin it to your taskbar or desktop from the Start menu.',
      ],
    }
  }

  return {
    variant: 'install',
    title: 'Add DORINC to your home screen',
    message: 'Use your browser menu to install the app on this phone.',
    actionLabel: 'Show steps',
    action: 'steps',
    steps: [
      'Open the browser menu (⋮ on Chrome, or Share on some browsers).',
      'Tap Install app or Add to Home screen.',
      'Confirm — DORINC will appear on your home screen.',
    ],
  }
}
