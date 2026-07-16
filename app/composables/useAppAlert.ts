interface AppAlertState {
  open: boolean
  title: string
  message: string
}

const alertState = reactive<AppAlertState>({
  open: false,
  title: '',
  message: '',
})

export function useAppAlert() {
  function showAppAlert(message: string, title = '') {
    alertState.message = message
    alertState.title = title
    alertState.open = true
  }

  function dismissAlert() {
    alertState.open = false
  }

  return {
    alertState: readonly(alertState),
    showAppAlert,
    dismissAlert,
  }
}
