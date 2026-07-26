import { pwaInstallCopy, type PwaDeviceKind } from '#shared/pwa-install-copy'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

function detectDeviceKind(): PwaDeviceKind {
  if (!import.meta.client) return 'desktop'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 768px)').matches
  const mobileUa = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
  return coarse || narrow || mobileUa ? 'mobile' : 'desktop'
}

export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
  const installed = ref(false)
  const isIos = ref(false)
  const deviceKind = ref<PwaDeviceKind>('desktop')
  const stepsOpen = ref(false)
  const bannerReady = ref(false)

  const canPromptInstall = computed(() => !!deferredPrompt.value)

  const copy = computed(() => pwaInstallCopy({
    deviceKind: deviceKind.value,
    installed: installed.value,
    isIos: isIos.value,
    canPromptInstall: canPromptInstall.value,
  }))

  const showSteps = computed(() => stepsOpen.value && !!copy.value.steps?.length)

  function revealBanner() {
    bannerReady.value = true
  }

  function toggleSteps() {
    stepsOpen.value = !stepsOpen.value
  }

  async function install() {
    const prompt = deferredPrompt.value
    if (prompt) {
      await prompt.prompt()
      const choice = await prompt.userChoice
      deferredPrompt.value = null
      if (choice.outcome === 'accepted') {
        installed.value = true
        stepsOpen.value = false
        return true
      }
      return false
    }

    if (copy.value.steps?.length) {
      stepsOpen.value = true
    }
    return false
  }

  function onAction() {
    if (canPromptInstall.value) {
      void install()
      return
    }
    if (installed.value) {
      stepsOpen.value = false
      return
    }
    toggleSteps()
  }

  onMounted(() => {
    installed.value = window.matchMedia('(display-mode: standalone)').matches
    isIos.value = /iphone|ipad|ipod/i.test(navigator.userAgent)
    deviceKind.value = detectDeviceKind()

    window.setTimeout(revealBanner, 10_000)

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      deferredPrompt.value = event as BeforeInstallPromptEvent
    })

    window.addEventListener('appinstalled', () => {
      installed.value = true
      deferredPrompt.value = null
      stepsOpen.value = false
    })
  })

  return {
    bannerReady,
    canPromptInstall,
    copy,
    deviceKind,
    install,
    installed,
    onAction,
    showSteps,
    stepsOpen,
  }
}
