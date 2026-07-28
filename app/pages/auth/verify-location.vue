<script setup lang="ts">
import { clearGeoGateCleared } from '~/utils/geo-gate'

definePageMeta({
  layout: false,
  // Challenge is issued server-side on redirect. This page must not probe APIs.
  ssr: true,
})

const route = useRoute()
const err = computed(() => route.query.err === '1' || route.query.err === 'invalid')
const sent = computed(() => route.query.sent === '1')

onMounted(() => {
  // Force a fresh GPS gate check after verification completes.
  clearGeoGateCleared()
})
</script>

<template>
  <AuthServiceAreaShell title-lead="Service Area" title-accent="Restriction" notice="VERIFY">
    <p>
      You're accessing this service from a<br>
      suspicious location.<br>
      Please verify your identity.
    </p>

    <p v-if="sent" class="sa-status" role="status">
      A verification code was sent to your email.
    </p>
    <p v-if="err" class="sa-status sa-status--err" role="alert">
      That code was invalid or expired. Try again.
    </p>

    <!-- Native form POST — no XHR / no JSON scoping responses in the console. -->
    <form class="sa-form" method="post" action="/api/auth/outside-geo/verify" autocomplete="one-time-code">
      <label class="sa-label" for="outside-geo-code">6-digit code</label>
      <input
        id="outside-geo-code"
        class="sa-code"
        name="code"
        type="text"
        inputmode="numeric"
        pattern="[0-9]{6}"
        maxlength="6"
        minlength="6"
        placeholder="000000"
        required
      >
      <button class="sa-btn" type="submit">
        Verify identity
      </button>
    </form>

    <form method="post" action="/api/auth/outside-geo/challenge">
      <button class="sa-resend" type="submit">
        Resend code
      </button>
    </form>
  </AuthServiceAreaShell>
</template>

<style scoped>
.sa-status {
  margin: 0;
  font-size: 0.95rem;
  color: #2563eb;
}
.sa-status--err { color: #dc2626; }

.sa-form {
  display: grid;
  gap: 12px;
  width: 100%;
  margin-top: 4px;
}

.sa-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sa-code {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 1.45rem;
  letter-spacing: 0.42em;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.sa-code:focus {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
  border-color: #2563eb;
}

.sa-btn {
  appearance: none;
  border: 0;
  border-radius: 12px;
  padding: 13px 16px;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  cursor: pointer;
  box-shadow: 0 10px 20px -12px rgba(37, 99, 235, 0.8);
}

.sa-btn:hover { filter: brightness(1.03); }
.sa-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }

.sa-resend {
  appearance: none;
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  padding: 4px;
}

.sa-resend:hover { color: #2563eb; }
</style>
