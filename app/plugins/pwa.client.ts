import type { BeforeInstallPromptEvent } from '~/utils/pwa-install-state'
import {
  isPwaStandaloneMode,
  markPwaInstalledFlag,
  notifyPwaInstallListeners,
  pwaInstallState,
  readPwaInstalledFlag,
} from '~/utils/pwa-install-state'

const SW_VERSION = 'v5'

export default defineNuxtPlugin(() => {
  pwaInstallState.installed = readPwaInstalledFlag() || isPwaStandaloneMode()

  window.addEventListener('beforeinstallprompt', (event) => {
    if (pwaInstallState.installed) return
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
