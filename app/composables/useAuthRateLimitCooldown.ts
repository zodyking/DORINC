import {
  applyRateLimitFromError,
  clearRateLimitUntil,
  formatRateLimitCountdown,
  rateLimitMessage,
  rateLimitRemainingSeconds,
  readRateLimitUntil,
  type AuthRateLimitScope,
} from '~/utils/auth-rate-limit'

export function useAuthRateLimitCooldown(scope: AuthRateLimitScope) {
  const remainingSeconds = ref(0)
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let unlockTimer: ReturnType<typeof setTimeout> | null = null

  function stopTimers() {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
    if (unlockTimer) {
      clearTimeout(unlockTimer)
      unlockTimer = null
    }
  }

  function refresh() {
    const remaining = rateLimitRemainingSeconds(scope)
    remainingSeconds.value = remaining
    if (remaining <= 0) {
      clearRateLimitUntil(scope)
      stopTimers()
    }
  }

  function startTimer() {
    stopTimers()
    refresh()
    if (remainingSeconds.value <= 0) return

    tickTimer = setInterval(refresh, 250)
    const until = readRateLimitUntil(scope)
    const waitMs = until - Date.now()
    if (waitMs > 0) {
      unlockTimer = setTimeout(refresh, waitMs + 25)
    }
  }

  function applyFromError(err: unknown) {
    if (!applyRateLimitFromError(err, scope)) return false
    startTimer()
    return remainingSeconds.value > 0
  }

  onMounted(() => startTimer())
  onUnmounted(() => stopTimers())

  const isActive = computed(() => remainingSeconds.value > 0)
  const countdownLabel = computed(() => formatRateLimitCountdown(remainingSeconds.value))
  const message = computed(() => {
    if (remainingSeconds.value <= 0) return ''
    return rateLimitMessage(scope, remainingSeconds.value)
  })

  // reactive() unwraps nested refs in templates (`cooldown.isActive` is a boolean,
  // not a ComputedRef object that stays truthy after the timer hits 0).
  return reactive({
    remainingSeconds,
    isActive,
    countdownLabel,
    message,
    applyFromError,
    startTimer,
  })
}
