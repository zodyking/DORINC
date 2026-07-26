import { pwaInstallCopy, type PwaDeviceKind } from '#shared/pwa-install-copy'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const PWA_INSTALLED_KEY = 'dorinc-pwa-installed'

function detectDeviceKind(): PwaDeviceKind {
  if (!import.meta.client) return 'desktop'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 768px)').matches
  const mobileUa = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
  return coarse || narrow || mobileUa ? 'mobile' : 'desktop'
}

function isStandaloneMode(): boolean {
  if (!import.meta.client) return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || nav.standalone === true
}

function readInstalledFlag(): boolean {
  if (!import.meta.client) return false
  return localStorage.getItem(PWA_INSTALLED_KEY) === '1'
}

function markInstalledFlag(): void {
  if (!import.meta.client) return
  localStorage.setItem(PWA_INSTALLED_KEY, '1')
}

async function detectInstalledRelatedApp(): Promise<boolean> {
  if (!import.meta.client || !('getInstalledRelatedApps' in navigator)) return false
  try {
    const getApps = (navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ id?: string }>>
    }).getInstalledRelatedApps
    if (!getApps) return false
    const apps = await getApps()
    return apps.length > 0
  }
  catch {
    return false
  }
}

export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
  const installed = ref(false)
  const isStandalone = ref(false)
  const isIos = ref(false)
  const deviceKind = ref<PwaDeviceKind>('desktop')
  const stepsOpen = ref(false)
  const bannerReady = ref(false)

  const canPromptInstall = computed(() => !!deferredPrompt.value && !installed.value)

  const showBanner = computed(() => bannerReady.value && !isStandalone.value)

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

  function markInstalled() {
    installed.value = true
    markInstalledFlag()
    stepsOpen.value = false
    deferredPrompt.value = null
  }

  async function install() {
    const prompt = deferredPrompt.value
    if (prompt) {
      await prompt.prompt()
      const choice = await prompt.userChoice
      deferredPrompt.value = null
      if (choice.outcome === 'accepted') {
        markInstalled()
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
    toggleSteps()
  }

  onMounted(() => {
    isStandalone.value = isStandaloneMode()
    installed.value = readInstalledFlag()
    isIos.value = /iphone|ipad|ipod/i.test(navigator.userAgent)
    deviceKind.value = detectDeviceKind()

    if (isStandalone.value) {
      markInstalled()
      return
    }

    void detectInstalledRelatedApp().then((related) => {
      if (related) markInstalled()
    })

    nextTick(revealBanner)

    window.addEventListener('beforeinstallprompt', (event) => {
      if (installed.value) return
      event.preventDefault()
      deferredPrompt.value = event as BeforeInstallPromptEvent
    })

    window.addEventListener('appinstalled', () => {
      markInstalled()
    })
  })

  return {
    bannerReady,
    canPromptInstall,
    copy,
    deviceKind,
    install,
    installed,
    isStandalone,
    onAction,
    showBanner,
    showSteps,
    stepsOpen,
  }
}
