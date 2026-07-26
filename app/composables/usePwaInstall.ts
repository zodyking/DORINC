import { pwaInstallCopy } from '#shared/pwa-install-copy'
import { BRAND_NAME } from '~/constants/brand'
import {
  detectPwaDeviceKind,
  isIosDevice,
  isPwaStandaloneMode,
  markPwaInstalledFlag,
  pwaInstallState,
  subscribePwaInstall,
} from '~/utils/pwa-install-state'

export type { BeforeInstallPromptEvent } from '~/utils/pwa-install-state'

export function usePwaInstall() {
  const route = useRoute()
  const installed = ref(pwaInstallState.installed)
  const isStandalone = ref(false)
  const isIos = ref(false)
  const deviceKind = ref(detectPwaDeviceKind())
  const stepsOpen = ref(false)
  const dismissed = ref(false)
  const bannerReady = ref(false)

  const showBanner = computed(() => bannerReady.value && !isStandalone.value && !dismissed.value)

  const copy = computed(() => pwaInstallCopy({
    deviceKind: deviceKind.value,
    installed: installed.value,
    isIos: isIos.value,
  }))

  const showSteps = computed(() => stepsOpen.value && !!(copy.value.fallbackSteps?.length))

  const visibleSteps = computed(() => copy.value.fallbackSteps ?? [])

  function syncFromSharedState() {
    installed.value = pwaInstallState.installed
  }

  function revealBanner() {
    bannerReady.value = true
  }

  function closeBanner() {
    dismissed.value = true
    stepsOpen.value = false
  }

  function markInstalled() {
    markPwaInstalledFlag()
    installed.value = true
    stepsOpen.value = false
    pwaInstallState.deferredPrompt = null
  }

  async function shareForHomeScreen() {
    if (!import.meta.client || typeof navigator.share !== 'function') {
      stepsOpen.value = true
      return false
    }
    try {
      await navigator.share({
        title: BRAND_NAME,
        text: `Add ${BRAND_NAME} to your home screen`,
        url: window.location.href,
      })
      return true
    }
    catch {
      return false
    }
  }

  async function install() {
    const prompt = pwaInstallState.deferredPrompt
    if (prompt) {
      await prompt.prompt()
      const choice = await prompt.userChoice
      pwaInstallState.deferredPrompt = null
      if (choice.outcome === 'accepted') {
        markInstalled()
        return true
      }
      return false
    }

    stepsOpen.value = true
    return false
  }

  async function onAction() {
    const action = copy.value.action
    if (action === 'prompt') {
      await install()
      return
    }
    if (action === 'share') {
      const shared = await shareForHomeScreen()
      if (!shared && copy.value.fallbackSteps?.length) stepsOpen.value = true
    }
  }

  onMounted(() => {
    isStandalone.value = isPwaStandaloneMode()
    isIos.value = isIosDevice()
    deviceKind.value = detectPwaDeviceKind()
    syncFromSharedState()

    if (isStandalone.value) {
      markInstalled()
      return
    }

    const unsubscribe = subscribePwaInstall(syncFromSharedState)
    nextTick(revealBanner)

    onBeforeUnmount(unsubscribe)
  })

  watch(() => route.path, () => {
    dismissed.value = false
    stepsOpen.value = false
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
