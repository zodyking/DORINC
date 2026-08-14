<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'

const props = defineProps<{
  mode: 'blocked' | 'cleared'
  busy?: boolean
}>()

const emit = defineEmits<{
  allow: []
  dismiss: []
}>()

const showHow = ref(false)

const title = computed(() =>
  props.mode === 'blocked'
    ? 'Allow cookies to stay signed in'
    : 'Previous sign-in was cleared',
)

const message = computed(() =>
  props.mode === 'blocked'
    ? `${BRAND_NAME} keeps you signed in with a cookie on this device. If cookies are blocked, sign-in cannot finish.`
    : 'This phone still had a sign-in ticket from an old or expired account. It was removed. Sign in again to continue.',
)
</script>

<template>
  <aside
    class="auth-cookie"
    role="dialog"
    aria-labelledby="auth-cookie-title"
    aria-describedby="auth-cookie-copy"
  >
      <div class="auth-cookie__card">
        <div class="auth-cookie__icon" aria-hidden="true">
          <img :src="BRAND_ICON" alt="" width="36" height="36">
        </div>
        <div class="auth-cookie__body">
          <p class="auth-cookie__eyebrow">This device</p>
          <strong id="auth-cookie-title" class="auth-cookie__title">{{ title }}</strong>
          <p id="auth-cookie-copy" class="auth-cookie__copy">{{ message }}</p>
          <button
            v-if="mode === 'blocked'"
            type="button"
            class="auth-cookie__how-toggle"
            :aria-expanded="showHow"
            @click="showHow = !showHow"
          >
            {{ showHow ? 'Hide steps' : 'How to allow cookies' }}
          </button>
          <ol v-if="mode === 'blocked' && showHow" class="auth-cookie__steps">
            <li>Open this site’s settings in your browser (lock or “AA” icon in the address bar).</li>
            <li>Allow cookies / site data for this website.</li>
            <li>Return here and tap Allow cookies.</li>
          </ol>
        </div>
        <div class="auth-cookie__actions">
          <button
            v-if="mode === 'blocked'"
            type="button"
            class="auth-cookie__cta"
            :disabled="busy"
            @click="emit('allow')"
          >
            {{ busy ? 'Checking…' : 'Allow cookies' }}
          </button>
          <button
            type="button"
            class="auth-cookie__dismiss"
            :disabled="busy"
            @click="emit('dismiss')"
          >
            {{ mode === 'blocked' ? 'Not now' : 'OK' }}
          </button>
        </div>
      </div>
    </aside>
</template>

<style scoped>
.auth-cookie {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 80;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}
.auth-cookie__card {
  pointer-events: auto;
  width: min(560px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 16px 16px 14px;
  border-radius: 18px;
  border: 1px solid #c7d2fe;
  background: #fff;
  box-shadow: 0 18px 40px -16px rgba(15, 23, 42, 0.35);
}
.auth-cookie__icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #f8faff;
  display: grid;
  place-items: center;
}
.auth-cookie__icon img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.auth-cookie__body {
  min-width: 0;
}
.auth-cookie__eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6366f1;
}
.auth-cookie__title {
  display: block;
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.auth-cookie__copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #475569;
}
.auth-cookie__how-toggle {
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: #4f46e5;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  min-height: 32px;
}
.auth-cookie__steps {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #334155;
  font-size: 12.5px;
  line-height: 1.45;
}
.auth-cookie__steps li + li {
  margin-top: 4px;
}
.auth-cookie__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.auth-cookie__cta,
.auth-cookie__dismiss {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.auth-cookie__cta {
  border: none;
  background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
  box-shadow: 0 8px 20px -10px rgba(79, 70, 229, 0.9);
}
.auth-cookie__cta:disabled,
.auth-cookie__dismiss:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.auth-cookie__dismiss {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
}
@media (max-width: 640px) {
  .auth-cookie__card {
    grid-template-columns: auto 1fr;
  }
  .auth-cookie__actions {
    grid-column: 1 / -1;
    flex-direction: row;
  }
  .auth-cookie__cta,
  .auth-cookie__dismiss {
    flex: 1;
  }
}
</style>
