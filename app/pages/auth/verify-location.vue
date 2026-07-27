<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { authErrorMessage } from '~/utils/auth-errors'

definePageMeta({ layout: false })

const busy = ref(false)
const sending = ref(false)
const code = ref('')
const error = ref('')
const notice = ref('')
const maskedEmail = ref('')
const ready = ref(false)

async function requestCode() {
  sending.value = true
  error.value = ''
  try {
    const res = await $fetch<{
      alreadyVerified?: boolean
      maskedEmail?: string
      message?: string
      redirectTo?: string
    }>('/api/auth/outside-geo/challenge', { method: 'POST' })

    if (res.alreadyVerified && res.redirectTo) {
      await navigateTo(res.redirectTo)
      return
    }

    maskedEmail.value = res.maskedEmail ?? ''
    notice.value = res.message
      || (maskedEmail.value
        ? `A 6-digit verification code was sent to ${maskedEmail.value}.`
        : 'A 6-digit verification code was sent to your email.')
    ready.value = true
  }
  catch (err) {
    error.value = authErrorMessage(err, 'Could not send a verification code for this location.')
    ready.value = false
  }
  finally {
    sending.value = false
  }
}

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ verified: boolean, redirectTo?: string, message?: string }>(
      '/api/auth/outside-geo/verify',
      {
        method: 'POST',
        body: { code: code.value.replace(/\s+/g, '') },
      },
    )
    notice.value = res.message || 'Identity verified.'
    await navigateTo(res.redirectTo || '/auth/login')
  }
  catch (err) {
    error.value = authErrorMessage(err, 'Invalid or expired verification code')
  }
  finally {
    busy.value = false
  }
}

onMounted(() => {
  void requestCode()
})
</script>

<template>
  <main id="main-content" class="auth-screen">
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-head">
          <img class="sq" :src="BRAND_ICON" alt="" width="40" height="40">
          <div class="auth-head__text">
            <b>Verify your identity</b>
            <small>{{ BRAND_NAME }} security check</small>
          </div>
        </div>

        <div class="auth-body forgot-body">
          <p class="auth-hint">
            You're accessing this service from a suspicious location. Please verify your identity.
          </p>

          <p v-if="sending" class="auth-hint" role="status">
            Sending a verification code…
          </p>

          <template v-else-if="ready">
            <p v-if="notice" class="auth-hint auth-success" role="status">{{ notice }}</p>

            <form @submit.prevent="submit">
              <div class="fld">
                <label for="outside-geo-code">6-digit code</label>
                <input
                  id="outside-geo-code"
                  v-model="code"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxlength="6"
                  placeholder="000000"
                  required
                >
              </div>

              <p v-if="error" class="auth-hint auth-error" role="alert">{{ error }}</p>

              <button
                type="submit"
                class="btn primary forgot-btn"
                :disabled="busy || code.replace(/\s+/g, '').length !== 6"
              >
                {{ busy ? 'Verifying…' : 'Verify and continue' }}
              </button>
            </form>

            <div class="forgot-links">
              <button
                type="button"
                class="auth-link"
                :disabled="sending"
                @click="requestCode"
              >
                Resend code
              </button>
            </div>
          </template>

          <template v-else>
            <p v-if="error" class="auth-hint auth-error" role="alert">{{ error }}</p>
            <div class="forgot-links">
              <button type="button" class="btn primary forgot-btn" :disabled="sending" @click="requestCode">
                Try again
              </button>
            </div>
          </template>
        </div>
      </div>
      <footer class="suite-foot">© 2015 {{ BRAND_NAME }}. All rights reserved.</footer>
    </div>
  </main>
</template>

<style scoped>
.forgot-body { display: grid; gap: 14px; }
.forgot-btn { width: 100%; justify-content: center; margin-top: 4px; padding: 11px; }
.forgot-links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
#outside-geo-code {
  letter-spacing: 0.35em;
  font-variant-numeric: tabular-nums;
  text-align: center;
  font-size: 1.25rem;
}
</style>
