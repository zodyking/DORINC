<script setup lang="ts">
import { BRAND_ICON } from '~/constants/brand'
import { authErrorMessage } from '~/utils/auth-errors'

definePageMeta({ layout: false })

const route = useRoute()

type ResetState = 'form' | 'loading' | 'success' | 'error'

const RESET_TOKEN_STORAGE_KEY = 'dorinc.pendingResetToken'

const state = ref<ResetState>('form')
const password = ref('')
const confirm = ref('')
const reveal = reactive({ password: false, confirm: false })
const message = ref('')
const formError = ref('')
const resetToken = ref<string | null>(null)

function readStoredToken(): string | null {
  if (!import.meta.client) return null
  try {
    return sessionStorage.getItem(RESET_TOKEN_STORAGE_KEY)
  }
  catch {
    return null
  }
}

function storeToken(token: string) {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(RESET_TOKEN_STORAGE_KEY, token)
  }
  catch {
    // ignore storage failures
  }
}

function clearStoredToken() {
  if (!import.meta.client) return
  try {
    sessionStorage.removeItem(RESET_TOKEN_STORAGE_KEY)
  }
  catch {
    // ignore storage failures
  }
}

function captureTokenFromRoute() {
  const fromQuery = typeof route.query.token === 'string' ? route.query.token.trim() : ''
  if (fromQuery) {
    resetToken.value = fromQuery
    storeToken(fromQuery)
  }
}

captureTokenFromRoute()

async function submitReset() {
  const token = resetToken.value ?? readStoredToken()
  if (!token) {
    formError.value = 'Reset link expired — request a new password reset email.'
    return
  }

  if (password.value !== confirm.value) {
    formError.value = 'Passwords do not match'
    return
  }

  state.value = 'loading'
  formError.value = ''
  message.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password: password.value },
    })
    clearStoredToken()
    state.value = 'success'
    message.value = res.message
  }
  catch (err) {
    state.value = 'error'
    message.value = authErrorMessage(err, 'Could not reset your password — the link may be invalid or expired.')
  }
}

onMounted(() => {
  const fromQuery = typeof route.query.token === 'string' ? route.query.token.trim() : ''
  if (fromQuery) {
    resetToken.value = fromQuery
    storeToken(fromQuery)
    void navigateTo({ path: '/auth/reset-password', query: {} }, { replace: true })
    return
  }

  if (!resetToken.value) {
    resetToken.value = readStoredToken()
  }

  if (!resetToken.value) {
    state.value = 'error'
    message.value = 'This reset link is missing or invalid. Request a new password reset email from the sign-in page.'
  }
})
</script>

<template>
  <main id="main-content" class="auth-screen">
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-head">
          <img class="sq" :src="BRAND_ICON" alt="" width="40" height="40">
          <div class="auth-head__text">
            <b>Reset password</b>
            <small>DORINC staff account</small>
          </div>
        </div>

        <div class="auth-body reset-body">
          <p v-if="state === 'loading'" class="auth-hint" role="status">Updating your password…</p>

          <template v-else-if="state === 'success'">
            <p class="auth-hint auth-success" role="status">{{ message }}</p>
            <NuxtLink to="/auth/login?card=staff" class="btn primary reset-btn">
              Sign in
            </NuxtLink>
          </template>

          <template v-else-if="state === 'error'">
            <p class="auth-hint auth-error" role="alert">{{ message }}</p>
            <div class="reset-links">
              <NuxtLink to="/auth/forgot-password" class="btn primary reset-btn">
                Request new reset link
              </NuxtLink>
              <NuxtLink to="/auth/login?card=staff" class="btn reset-btn">
                Back to sign in
              </NuxtLink>
            </div>
          </template>

          <form v-else @submit.prevent="submitReset">
            <p class="auth-hint">Choose a new password (minimum 12 characters).</p>
            <div class="fld">
              <label for="reset-password">New password</label>
              <div class="secret-fld">
                <input
                  id="reset-password"
                  v-model="password"
                  :type="reveal.password ? 'text' : 'password'"
                  autocomplete="new-password"
                  minlength="12"
                  required
                >
                <button type="button" class="reveal" @click="reveal.password = !reveal.password">
                  {{ reveal.password ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <div class="fld">
              <label for="reset-confirm">Confirm password</label>
              <div class="secret-fld">
                <input
                  id="reset-confirm"
                  v-model="confirm"
                  :type="reveal.confirm ? 'text' : 'password'"
                  autocomplete="new-password"
                  minlength="12"
                  required
                >
                <button type="button" class="reveal" @click="reveal.confirm = !reveal.confirm">
                  {{ reveal.confirm ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <p v-if="formError" class="auth-hint auth-error" role="alert">{{ formError }}</p>

            <button type="submit" class="btn primary reset-btn">
              Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.reset-body {
  padding: 20px 24px 26px;
}
.reset-btn {
  display: flex;
  width: 100%;
  justify-content: center;
  margin-top: 14px;
  padding: 11px;
  text-decoration: none;
}
.reset-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
