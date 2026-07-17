<script setup lang="ts">
import { BRAND_ICON } from '~/constants/brand'

definePageMeta({ layout: false })

const route = useRoute()

type VerifyState = 'loading' | 'success' | 'error'

const state = ref<VerifyState>('loading')
const message = ref('')
const loginReady = ref(false)

interface FetchError {
  data?: { data?: { message?: string }, message?: string }
}

function messageFrom(err: unknown, fallback: string): string {
  const fe = err as FetchError
  return fe.data?.data?.message ?? fe.data?.message ?? fallback
}

const VERIFY_TOKEN_STORAGE_KEY = 'dorinc.pendingVerifyToken'

function storedVerifyToken(): string {
  try {
    return sessionStorage.getItem(VERIFY_TOKEN_STORAGE_KEY)?.trim() ?? ''
  }
  catch {
    return ''
  }
}

function storeVerifyToken(token: string) {
  try {
    sessionStorage.setItem(VERIFY_TOKEN_STORAGE_KEY, token)
  }
  catch {
    // Continue with the in-memory token when storage is unavailable.
  }
}

function clearVerifyToken() {
  try {
    sessionStorage.removeItem(VERIFY_TOKEN_STORAGE_KEY)
  }
  catch {
    // Nothing to clean up.
  }
}

async function verifyToken(token: string) {
  state.value = 'loading'
  message.value = ''
  loginReady.value = false
  try {
    const res = await $fetch<{ status: string, message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: { token },
    })
    state.value = 'success'
    message.value = res.message
    loginReady.value = res.status === 'verified'
  }
  catch (err) {
    state.value = 'error'
    message.value = messageFrom(err, 'Could not verify your email — the link may be invalid or expired.')
  }
  finally {
    clearVerifyToken()
  }
}

onMounted(() => {
  const fromQuery = typeof route.query.token === 'string' ? route.query.token.trim() : ''
  if (fromQuery) {
    storeVerifyToken(fromQuery)
    window.history.replaceState(window.history.state, '', '/auth/verify-email')
  }
  const token = fromQuery || storedVerifyToken()

  if (!token) {
    state.value = 'error'
    message.value = 'This verification link is missing or invalid. Resend a fresh verification email using your account email and password.'
    return
  }

  void verifyToken(token)
})
</script>

<template>
  <main id="main-content" class="auth-screen">
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-head">
          <img class="sq" :src="BRAND_ICON" alt="" width="40" height="40">
          <div class="auth-head__text">
            <b>Email verification</b>
            <small>DORINC staff account</small>
          </div>
        </div>

        <div class="auth-body verify-email-body">
          <p v-if="state === 'loading'" class="auth-hint" role="status">Verifying your email…</p>

          <template v-else-if="state === 'success'">
            <p class="auth-hint auth-ok" role="status">{{ message }}</p>
            <NuxtLink
              v-if="loginReady"
              to="/auth/login?card=staff"
              class="btn primary verify-email-btn"
            >
              Sign in
            </NuxtLink>
            <NuxtLink
              v-else
              to="/auth/login?card=staff"
              class="btn primary verify-email-btn"
            >
              Back to sign in
            </NuxtLink>
          </template>

          <template v-else>
            <p class="auth-hint auth-error" role="alert">{{ message }}</p>
            <div class="verify-email-actions">
              <NuxtLink to="/auth/resend-verification" class="btn primary verify-email-btn">
                Resend verification email
              </NuxtLink>
              <NuxtLink to="/auth/login?card=staff" class="btn verify-email-btn">
                Sign in
              </NuxtLink>
              <NuxtLink to="/auth/signup" class="btn verify-email-btn">
                Request account
              </NuxtLink>
            </div>
          </template>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.verify-email-body {
  padding: 24px;
}
.verify-email-btn {
  display: flex;
  width: 100%;
  justify-content: center;
  margin-top: 14px;
  padding: 11px;
  text-decoration: none;
}
.verify-email-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.auth-ok {
  color: #047857;
}
</style>
