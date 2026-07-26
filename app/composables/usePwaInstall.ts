import { pwaInstallCopy, type PwaDeviceKind } from '#shared/pwa-install-copy'
import { BRAND_NAME } from '~/constants/brand'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const PWA_INSTALLED_KEY = 'dorinc-pwa-installed'
const PWA_BANNER_CLOSED_KEY = 'dorinc-pwa-banner-closed'

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

function readBannerClosedFlag(): boolean {
  if (!import.meta.client) return false
  return sessionStorage.getItem(PWA_BANNER_CLOSED_KEY) === '1'
}

function markBannerClosedFlag(): void {
  if (!import.meta.client) return
  sessionStorage.setItem(PWA_BANNER_CLOSED_KEY, '1')
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
  const dismissed = ref(false)
  const fallbackSteps = ref<string[] | null>(null)

  const canPromptInstall = computed(() => !!deferredPrompt.value && !installed.value)

  const showBanner = computed(() => bannerReady.value && !isStandalone.value && !dismissed.value)

  const copy = computed(() => pwaInstallCopy({
    deviceKind: deviceKind.value,
    installed: installed.value,
    isIos: isIos.value,
    canPromptInstall: canPromptInstall.value,
  }))

  const showSteps = computed(() => stepsOpen.value && !!(copy.value.steps?.length || fallbackSteps.value?.length))

  const visibleSteps = computed(() => copy.value.steps ?? fallbackSteps.value ?? [])

  function revealBanner() {
    bannerReady.value = true
  }

  function closeBanner() {
    dismissed.value = true
    stepsOpen.value = false
    markBannerClosedFlag()
  }

  function markInstalled() {
    installed.value = true
    markInstalledFlag()
    stepsOpen.value = false
    deferredPrompt.value = null
  }

  async function shareForHomeScreen() {
    if (!import.meta.client || typeof navigator.share !== 'function') {
      fallbackSteps.value = [
        'Tap the Share button at the bottom of Safari.',
        'Scroll down and tap Add to Home Screen.',
        'Tap Add in the top right corner.',
      ]
      stepsOpen.value = true
      return false
    }
    try {
      await navigator.share({
        title: BRAND_NAME,
        text: `Add ${BRAND_NAME} to your home screen`,
        url: window.location.origin,
      })
      return true
    }
    catch {
      return false
    }
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
    return false
  }

  async function onAction() {
    const action = copy.value.action
    if (action === 'prompt') {
      await install()
      return
    }
    if (action === 'share') {
      await shareForHomeScreen()
      return
    }
    if (action === 'steps') {
      stepsOpen.value = !stepsOpen.value
    }
  }

  onMounted(() => {
    dismissed.value = readBannerClosedFlag()
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
    closeBanner,
    copy,
    onAction,
    showBanner,
    showSteps,
    visibleSteps,
  }
}
