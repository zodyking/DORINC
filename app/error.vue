<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'

const props = defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
    message?: string
  }
}>()

const status = computed(() => props.error?.statusCode || 500)
const isNotFound = computed(() => status.value === 404)

const title = computed(() => {
  if (isNotFound.value) return 'Page not found'
  if (status.value === 403) return 'Access denied'
  return 'Something went wrong'
})

const detail = computed(() => {
  if (isNotFound.value) {
    return 'That page does not exist, or the link may be outdated.'
  }
  return props.error?.statusMessage
    || props.error?.message
    || 'Please try again, or return to the workspace.'
})

function goHome() {
  clearError({ redirect: '/' })
}

function goLogin() {
  clearError({ redirect: '/auth/login?card=staff' })
}
</script>

<template>
  <div class="app-error ann-login-bg">
    <div class="app-error__card">
      <div class="app-error__brand">
        <img :src="BRAND_ICON" alt="" width="40" height="40">
        <span>{{ BRAND_NAME }}</span>
      </div>
      <p class="app-error__code">{{ status }}</p>
      <h1 class="app-error__title">{{ title }}</h1>
      <p class="app-error__detail">{{ detail }}</p>
      <div class="app-error__actions">
        <button type="button" class="btn primary" @click="goHome">
          Go to home
        </button>
        <button type="button" class="btn" @click="goLogin">
          Staff sign in
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-error {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
}

.app-error__card {
  width: min(100%, 420px);
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 16px 40px -16px rgba(15, 23, 42, 0.18);
  padding: 28px 24px 24px;
  text-align: center;
}

.app-error__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: -0.02em;
  color: #0f172a;
  margin-bottom: 18px;
}

.app-error__brand img {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.app-error__code {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.app-error__title {
  margin: 6px 0 8px;
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
}

.app-error__detail {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.55;
  color: #64748b;
}

.app-error__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
</style>
