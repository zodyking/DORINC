export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const DISMISS_KEY = 'dorinc-pwa-install-dismissed'

export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
  const installed = ref(false)
  const dismissed = ref(false)

  const canInstall = computed(() =>
    !!deferredPrompt.value && !installed.value && !dismissed.value,
  )

  function readDismissed() {
    if (!import.meta.client) return false
    return localStorage.getItem(DISMISS_KEY) === '1'
  }

  function dismiss() {
    dismissed.value = true
    if (import.meta.client) localStorage.setItem(DISMISS_KEY, '1')
  }

  async function install() {
    const prompt = deferredPrompt.value
    if (!prompt) return false
    await prompt.prompt()
    const choice = await prompt.userChoice
    deferredPrompt.value = null
    if (choice.outcome === 'accepted') {
      installed.value = true
      return true
    }
    dismiss()
    return false
  }

  onMounted(() => {
    dismissed.value = readDismissed()
    installed.value = window.matchMedia('(display-mode: standalone)').matches

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      deferredPrompt.value = event as BeforeInstallPromptEvent
    })

    window.addEventListener('appinstalled', () => {
      installed.value = true
      deferredPrompt.value = null
    })
  })

  return { canInstall, install, dismiss, installed }
}
