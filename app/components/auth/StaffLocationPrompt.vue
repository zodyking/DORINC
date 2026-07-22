<script setup lang="ts">
import type { StaffLoginGeo } from '#shared/validators/auth'
import { mapStaffLoginGeoError, requestStaffLoginGeo } from '~/utils/staff-login-geo'

const emit = defineEmits<{
  complete: [geo: StaffLoginGeo]
  cancel: []
}>()

const phase = ref<'prompt' | 'requesting' | 'error'>('prompt')
const error = ref('')

async function allowLocation() {
  phase.value = 'requesting'
  error.value = ''
  try {
    const geo = await requestStaffLoginGeo()
    emit('complete', geo)
  }
  catch (err: unknown) {
    error.value = (err as Error)?.message?.startsWith('GEO_')
      ? mapStaffLoginGeoError(err)
      : 'Could not read your device location. Try again.'
    phase.value = 'error'
  }
}
</script>

<template>
  <div class="loc-overlay" role="dialog" aria-modal="true" aria-labelledby="loc-title">
    <div class="loc-card">
      <div class="loc-icon" aria-hidden="true">
        <span class="loc-pulse" />
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z" />
          <circle cx="12" cy="11" r="2.5" />
        </svg>
      </div>
      <h2 id="loc-title" class="loc-title">One quick security check</h2>
      <p class="loc-copy">
        We use your device location to help protect this workspace. Your browser will ask for permission — choose <strong>Allow</strong> to finish signing in.
      </p>
      <p v-if="error" class="loc-error" role="alert">{{ error }}</p>
      <div class="loc-actions">
        <button
          type="button"
          class="btn primary loc-btn"
          :disabled="phase === 'requesting'"
          @click="allowLocation"
        >
          {{ phase === 'requesting' ? 'Checking location…' : 'Allow location & continue' }}
        </button>
        <button type="button" class="btn loc-cancel" :disabled="phase === 'requesting'" @click="emit('cancel')">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loc-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  animation: loc-fade-in 0.25s ease;
}
.loc-card {
  width: min(100%, 400px);
  background: #fff;
  border-radius: 16px;
  padding: 28px 24px 24px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
  text-align: center;
  animation: loc-slide-up 0.35s ease;
}
.loc-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  color: #4f46e5;
}
.loc-pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(79, 70, 229, 0.15);
  animation: loc-pulse 2s ease-in-out infinite;
}
.loc-title {
  margin: 0 0 8px;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}
.loc-copy {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.55;
  color: #64748b;
}
.loc-error {
  margin: 0 0 16px;
  font-size: 13px;
  color: #dc2626;
  line-height: 1.45;
}
.loc-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.loc-btn {
  width: 100%;
  justify-content: center;
  padding: 11px 16px;
}
.loc-cancel {
  width: 100%;
  justify-content: center;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 13px;
}
@keyframes loc-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes loc-slide-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes loc-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0.25; }
}
@media (prefers-reduced-motion: reduce) {
  .loc-overlay, .loc-card, .loc-pulse { animation: none; }
}
</style>
