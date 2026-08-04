import { readonly, ref, watchEffect, type Ref } from 'vue'

/** Shared bridge so the staff topbar can toggle the floating help widget on mobile. */
const widgetVisible = ref(false)
const panelOpen = ref(false)
let togglePanelFn: (() => void) | null = null
let stopWatch: (() => void) | null = null

export function usePlatformHelpShell() {
  function registerWidget(opts: {
    visible: Ref<boolean>
    panelOpen: Ref<boolean>
    togglePanel: () => void
  }) {
    stopWatch?.()
    togglePanelFn = opts.togglePanel

    stopWatch = watchEffect(() => {
      widgetVisible.value = opts.visible.value
      panelOpen.value = opts.panelOpen.value
    })
  }

  function unregisterWidget() {
    stopWatch?.()
    stopWatch = null
    togglePanelFn = null
    widgetVisible.value = false
    panelOpen.value = false
  }

  function toggleFromTopbar() {
    togglePanelFn?.()
  }

  return {
    shellWidgetVisible: readonly(widgetVisible),
    shellPanelOpen: readonly(panelOpen),
    registerWidget,
    unregisterWidget,
    toggleFromTopbar,
  }
}
