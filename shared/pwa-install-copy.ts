export type PwaDeviceKind = 'desktop' | 'mobile'

export type PwaInstallVariant = 'install' | 'installed'

export type PwaInstallAction = 'prompt' | 'share' | null

export interface PwaInstallCopyInput {
  deviceKind: PwaDeviceKind
  installed: boolean
  isIos: boolean
}

export interface PwaInstallCopy {
  variant: PwaInstallVariant
  title: string
  message: string
  actionLabel: string | null
  action: PwaInstallAction
  fallbackSteps: string[] | null
}

export function pwaInstallCopy(input: PwaInstallCopyInput): PwaInstallCopy {
  const { deviceKind, installed, isIos } = input
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
      fallbackSteps: null,
    }
  }

  if (isIos) {
    return {
      variant: 'install',
      title: 'Add DORINC to your home screen',
      message: 'Tap the button below, then choose Add to Home Screen in the menu that opens.',
      actionLabel: 'Add to home screen',
      action: 'share',
      fallbackSteps: [
        'Tap the Share button at the bottom of Safari.',
        'Scroll down and tap Add to Home Screen.',
        'Tap Add in the top right corner.',
      ],
    }
  }

  if (isDesktop) {
    return {
      variant: 'install',
      title: 'Add DORINC to your desktop',
      message: 'Install once for quick access from your desktop, taskbar, and Start menu.',
      actionLabel: 'Add to desktop',
      action: 'prompt',
      fallbackSteps: [
        'In Chrome or Edge, click the install icon in the address bar (or ⋮ menu → Install app).',
        'Confirm Install — DORINC will open in its own window.',
        'Pin it to your taskbar or desktop from the Start menu.',
      ],
    }
  }

  return {
    variant: 'install',
    title: 'Add DORINC to your home screen',
    message: 'Install for one-tap access in the shop.',
    actionLabel: 'Add to home screen',
    action: 'prompt',
    fallbackSteps: [
      'Open the browser menu (⋮ on Chrome).',
      'Tap Install app or Add to Home screen.',
      'Confirm — DORINC will appear on your home screen.',
    ],
  }
}
