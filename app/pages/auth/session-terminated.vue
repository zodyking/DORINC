<script setup lang="ts">
import { SESSION_TERMINATED_REDIRECT_SECONDS } from '#shared/session-termination'

definePageMeta({
  layout: false,
  ssr: true,
})

const secondsLeft = ref(SESSION_TERMINATED_REDIRECT_SECONDS)
let timer: ReturnType<typeof setInterval> | null = null

function goLogin() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  void navigateTo('/auth/login?card=staff', { replace: true })
}

onMounted(() => {
  timer = setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) goLogin()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <AuthServiceAreaShell
    title-lead="Your Session"
    title-accent="Has Been Terminated"
    notice="SECURITY"
  >
    <p>
      An administrator ended all active sessions<br>
      for security. Any open work was saved when possible.
    </p>
    <p class="term-countdown" role="status" aria-live="polite">
      Redirecting to sign in in <b>{{ secondsLeft }}</b> second{{ secondsLeft === 1 ? '' : 's' }}…
    </p>
    <button type="button" class="btn primary term-btn" @click="goLogin">
      Sign In Now
    </button>
  </AuthServiceAreaShell>
</template>

<style scoped>
.term-countdown {
  margin: 0;
  font-size: 0.95rem;
  color: #475569;
}

.term-btn {
  justify-self: center;
  min-width: 160px;
}
</style>
