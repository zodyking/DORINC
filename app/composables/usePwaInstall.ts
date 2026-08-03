import { pwaInstallCopy } from '#shared/pwa-install-copy'
import { detectPwaBrowser } from '#shared/pwa-browser-detect'
import {
  detectPwaDeviceKind,
  isPwaStandaloneMode,
  markPwaBannerDismissed,
  markPwaInstalledFlag,
  pwaInstallState,
  readPwaBannerDismissed,
  subscribePwaInstall,
} from '~/utils/pwa-install-state'

export type { BeforeInstallPromptEvent } from '~/utils/pwa-install-state'

export function usePwaInstall() {
  const installed = ref(pwaInstallState.installed)
  const isStandalone = ref(false)
  const browser = ref(detectPwaBrowser())
  const deviceKind = ref(detectPwaDeviceKind())
  const stepsOpen = ref(false)
  const dismissed = ref(false)
  const bannerReady = ref(false)

  const showBanner = computed(() => bannerReady.value && !isStandalone.value && !dismissed.value)

  const copy = computed(() => pwaInstallCopy({
    deviceKind: deviceKind.value,
    installed: installed.value,
    browser: browser.value,
  }))

  const showSteps = computed(() => {
    if (!copy.value.steps?.length) return false
    return copy.value.stepsExpandedByDefault || stepsOpen.value
  })

  const visibleSteps = computed(() => copy.value.steps ?? [])

  function syncFromSharedState() {
    installed.value = pwaInstallState.installed
  }

  function revealBanner() {
    bannerReady.value = true
  }

  function closeBanner() {
    dismissed.value = true
    markPwaBannerDismissed()
    stepsOpen.value = false
  }

  function markInstalled() {
    markPwaInstalledFlag()
    installed.value = true
    stepsOpen.value = false
    pwaInstallState.deferredPrompt = null
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
    if (action === 'show-steps') {
      stepsOpen.value = true
    }
  }

  onMounted(() => {
    isStandalone.value = isPwaStandaloneMode()
    browser.value = detectPwaBrowser()
    deviceKind.value = detectPwaDeviceKind()
    dismissed.value = readPwaBannerDismissed()
    syncFromSharedState()

    if (isStandalone.value) {
      markInstalled()
      return
    }

    const unsubscribe = subscribePwaInstall(syncFromSharedState)
    nextTick(revealBanner)

    onBeforeUnmount(unsubscribe)
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
