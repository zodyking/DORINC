import type { BeforeInstallPromptEvent } from '~/utils/pwa-install-state'
import {
  clearPwaInstalledFlag,
  isPwaStandaloneMode,
  markPwaInstalledFlag,
  notifyPwaInstallListeners,
  pwaInstallState,
  refreshPwaInstallState,
} from '~/utils/pwa-install-state'

const SW_VERSION = 'v5'

export default defineNuxtPlugin(() => {
  pwaInstallState.installed = isPwaStandaloneMode()
  void refreshPwaInstallState()

  window.addEventListener('beforeinstallprompt', (event) => {
    clearPwaInstalledFlag()
    event.preventDefault()
    pwaInstallState.deferredPrompt = event as BeforeInstallPromptEvent
    notifyPwaInstallListeners()
  })

  window.addEventListener('appinstalled', () => {
    markPwaInstalledFlag()
    pwaInstallState.deferredPrompt = null
    notifyPwaInstallListeners()
  })

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`/sw.js?${SW_VERSION}`)
        .then((registration) => {
          void registration.update()
        })
        .catch(() => {
          // Registration failure must not block the app shell.
        })
    })
  }
})
