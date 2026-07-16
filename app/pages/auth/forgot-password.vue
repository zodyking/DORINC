<script setup lang="ts">
import { BRAND_ICON } from '~/constants/brand'
import { authErrorMessage } from '~/utils/auth-errors'

definePageMeta({ layout: false })

const route = useRoute()

const isCustomerPortal = computed(() => route.query.portal === 'customer')

const email = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')

onMounted(() => {
  const fromQuery = typeof route.query.email === 'string' ? route.query.email.trim() : ''
  if (fromQuery) email.value = fromQuery
})

async function submit() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value },
    })
    message.value = res.message
  }
  catch (err) {
    error.value = authErrorMessage(err, 'Could not send password reset email')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <main id="main-content" class="auth-screen">
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-head">
          <img class="sq" :src="BRAND_ICON" alt="" width="40" height="40">
          <div class="auth-head__text">
            <b>{{ isCustomerPortal ? 'Customer portal' : 'Forgot password' }}</b>
            <small>{{ isCustomerPortal ? 'Password help' : 'DORINC staff account' }}</small>
          </div>
        </div>

        <div class="auth-body forgot-body">
          <template v-if="isCustomerPortal">
            <p class="auth-hint">
              Customer portal passwords are issued by your shop. Contact them to request new login credentials.
            </p>
            <div class="forgot-links">
              <NuxtLink to="/auth/login?card=customer" class="btn primary forgot-btn">
                Back to sign in
              </NuxtLink>
            </div>
          </template>

          <template v-else>
            <p class="auth-hint">
              Enter the email for your staff account. If it matches an active account, we will email a reset link (valid 1 hour).
            </p>

            <form @submit.prevent="submit">
              <div class="fld">
                <label for="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  v-model="email"
                  type="email"
                  autocomplete="username"
                  required
                >
              </div>

              <p v-if="error" class="auth-hint auth-error" role="alert">{{ error }}</p>
              <p v-if="message" class="auth-hint auth-success" role="status">{{ message }}</p>

              <button
                type="submit"
                class="btn primary forgot-btn"
                :disabled="busy"
              >
                {{ busy ? 'Sending…' : 'Send reset link' }}
              </button>
            </form>

            <div class="forgot-links">
              <NuxtLink to="/auth/login?card=staff" class="auth-link">Back to sign in</NuxtLink>
              <NuxtLink to="/auth/resend-verification" class="auth-link">Resend verification email</NuxtLink>
            </div>
          </template>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.forgot-body {
  padding: 20px 24px 26px;
}
.forgot-btn {
  width: 100%;
  justify-content: center;
  margin-top: 14px;
  padding: 11px;
  text-decoration: none;
}
.forgot-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  text-align: center;
}
</style>
