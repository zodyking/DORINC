export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
  const installed = ref(false)
  const isIos = ref(false)

  const canPromptInstall = computed(() => !!deferredPrompt.value)

  const installHint = computed(() => {
    if (installed.value) {
      return 'Launch DORINC from your desktop shortcut or home screen anytime.'
    }
    if (canPromptInstall.value) {
      return 'Add to your home screen or desktop for quick access — works on mobile and Windows.'
    }
    if (isIos.value) {
      return 'On iPhone: tap Share, then Add to Home Screen.'
    }
    return 'Use your browser menu to install or add DORINC to your home screen.'
  })

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
    return false
  }

  onMounted(() => {
    installed.value = window.matchMedia('(display-mode: standalone)').matches
    isIos.value = /iphone|ipad|ipod/i.test(navigator.userAgent)

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      deferredPrompt.value = event as BeforeInstallPromptEvent
    })

    window.addEventListener('appinstalled', () => {
      installed.value = true
      deferredPrompt.value = null
    })
  })

  return {
    canPromptInstall,
    install,
    installed,
    installHint,
    showInstallBanner: computed(() => true),
  }
}
