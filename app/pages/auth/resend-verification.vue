<script setup lang="ts">
import { BRAND_ICON } from '~/constants/brand'

definePageMeta({ layout: false })

const route = useRoute()

const email = ref('')
const password = ref('')
const reveal = ref(false)

const { busy, message, error, resend, reset } = useResendVerification()

onMounted(() => {
  const fromQuery = typeof route.query.email === 'string' ? route.query.email.trim() : ''
  if (fromQuery) email.value = fromQuery
})

async function submit() {
  reset()
  await resend(email.value, password.value)
}
</script>

<template>
  <main id="main-content" class="auth-screen">
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-head">
          <img class="sq" :src="BRAND_ICON" alt="" width="40" height="40">
          <div class="auth-head__text">
            <b>Resend verification</b>
            <small>DORINC staff account</small>
          </div>
        </div>

        <div class="auth-body resend-body">
          <p class="auth-hint">
            Enter the email and password from your account request. We will send a fresh verification link (valid 24 hours).
          </p>

          <form @submit.prevent="submit">
            <div class="fld">
              <label for="resend-email">Email</label>
              <input
                id="resend-email"
                v-model="email"
                type="email"
                autocomplete="username"
                required
              >
            </div>
            <div class="fld">
              <label for="resend-password">Password</label>
              <div class="secret-fld">
                <input
                  id="resend-password"
                  v-model="password"
                  :type="reveal ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                >
                <button type="button" class="reveal" @click="reveal = !reveal">
                  {{ reveal ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <p v-if="error" class="auth-hint auth-error" role="alert">{{ error }}</p>
            <p v-if="message" class="auth-hint auth-success" role="status">{{ message }}</p>

            <button
              type="submit"
              class="btn primary resend-btn"
              :disabled="busy"
            >
              {{ busy ? 'Sending…' : 'Resend verification email' }}
            </button>
          </form>

          <div class="resend-links">
            <NuxtLink to="/auth/login?card=staff" class="auth-link">Back to sign in</NuxtLink>
            <NuxtLink to="/auth/signup" class="auth-link">Request a new account</NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.resend-body {
  padding: 20px 24px 26px;
}
.resend-btn {
  width: 100%;
  justify-content: center;
  margin-top: 14px;
  padding: 11px;
}
.resend-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  text-align: center;
}
</style>
