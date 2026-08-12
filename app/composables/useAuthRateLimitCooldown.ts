import {
  applyRateLimitFromError,
  clearRateLimitUntil,
  formatRateLimitCountdown,
  rateLimitMessage,
  rateLimitRemainingSeconds,
  type AuthRateLimitScope,
} from '~/utils/auth-rate-limit'

export function useAuthRateLimitCooldown(scope: AuthRateLimitScope) {
  const remainingSeconds = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  function refresh() {
    remainingSeconds.value = rateLimitRemainingSeconds(scope)
    if (remainingSeconds.value <= 0) {
      clearRateLimitUntil(scope)
      stopTimer()
    }
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function startTimer() {
    stopTimer()
    refresh()
    if (remainingSeconds.value > 0) {
      timer = setInterval(refresh, 1000)
    }
  }

  function applyFromError(err: unknown) {
    if (!applyRateLimitFromError(err, scope)) return false
    startTimer()
    return true
  }

  onMounted(() => startTimer())
  onUnmounted(() => stopTimer())

  const isActive = computed(() => remainingSeconds.value > 0)
  const countdownLabel = computed(() => formatRateLimitCountdown(remainingSeconds.value))
  const message = computed(() => {
    if (!isActive.value) return ''
    return rateLimitMessage(scope, remainingSeconds.value)
  })

  return {
    remainingSeconds,
    isActive,
    countdownLabel,
    message,
    applyFromError,
    startTimer,
  }
}
