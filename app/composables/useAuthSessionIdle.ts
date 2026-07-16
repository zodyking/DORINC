import {
  SESSION_IDLE_COUNTDOWN_MS,
  SESSION_IDLE_COUNTDOWN_SECONDS,
  SESSION_IDLE_WARNING_AFTER_MS,
} from '#shared/session-idle'

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'pointerdown'] as const

export function useAuthSessionIdle() {
  const auth = useAuthStore()

  const warningVisible = useState('session-idle-warning-visible', () => false)
  const secondsRemaining = useState('session-idle-seconds', () => SESSION_IDLE_COUNTDOWN_SECONDS)
  const signingOut = useState('session-idle-signing-out', () => false)

  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let countdownDeadline = 0
  let started = false

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function clearCountdownTimer() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  function hideWarning() {
    warningVisible.value = false
    secondsRemaining.value = SESSION_IDLE_COUNTDOWN_SECONDS
    clearCountdownTimer()
  }

  function scheduleIdleWarning() {
    clearIdleTimer()
    if (!auth.isSignedIn || signingOut.value) return

    idleTimer = setTimeout(() => {
      showWarning()
    }, SESSION_IDLE_WARNING_AFTER_MS)
  }

  function updateCountdown() {
    const left = Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000))
    secondsRemaining.value = left
    if (left <= 0) {
      void expireSession()
    }
  }

  function showWarning() {
    if (!auth.isSignedIn || signingOut.value) return
    warningVisible.value = true
    countdownDeadline = Date.now() + SESSION_IDLE_COUNTDOWN_MS
    secondsRemaining.value = SESSION_IDLE_COUNTDOWN_SECONDS
    clearCountdownTimer()
    countdownTimer = setInterval(updateCountdown, 250)
    updateCountdown()
  }

  async function expireSession() {
    if (signingOut.value) return
    signingOut.value = true
    hideWarning()
    clearIdleTimer()
    stop()

    try {
      await auth.handleSessionExpired()
    }
    finally {
      signingOut.value = false
    }
  }

  function onActivity() {
    if (!auth.isSignedIn || signingOut.value) return
    if (warningVisible.value) return
    scheduleIdleWarning()
  }

  function staySignedIn() {
    hideWarning()
    scheduleIdleWarning()
    if (auth.isSignedIn) {
      void $fetch('/api/auth/me').catch(() => undefined)
    }
  }

  function signOutNow() {
    void expireSession()
  }

  function start() {
    if (!import.meta.client || started || !auth.isSignedIn) return
    started = true
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisibility)
    scheduleIdleWarning()
  }

  function stop() {
    if (!import.meta.client || !started) return
    started = false
    clearIdleTimer()
    hideWarning()
    for (const event of ACTIVITY_EVENTS) {
      window.removeEventListener(event, onActivity)
    }
    document.removeEventListener('visibilitychange', onVisibility)
  }

  function onVisibility() {
    if (document.hidden) {
      clearIdleTimer()
      return
    }
    if (!warningVisible.value) scheduleIdleWarning()
  }

  watch(() => auth.isSignedIn, (signedIn) => {
    if (signedIn) start()
    else stop()
  })

  return {
    warningVisible,
    secondsRemaining,
    signingOut,
    start,
    stop,
    staySignedIn,
    signOutNow,
    resetIdleTimer: scheduleIdleWarning,
  }
}
