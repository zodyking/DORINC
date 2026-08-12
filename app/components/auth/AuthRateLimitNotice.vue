<script setup lang="ts">
defineProps<{
  message: string
  countdownLabel: string
  unlockHint?: string
}>()
</script>

<template>
  <div class="auth-callout auth-rate-limit" role="alert" aria-live="polite">
    <p class="auth-hint auth-error">{{ message }}</p>
    <p class="auth-rate-limit__timer" aria-hidden="true">{{ countdownLabel }}</p>
    <p class="auth-hint">
      {{ unlockHint ?? 'The button will unlock automatically when the timer reaches zero.' }}
    </p>
  </div>
</template>

<style scoped>
.auth-rate-limit__timer {
  font-size: 1.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  margin: 8px 0 4px;
  color: var(--danger, #b42318);
  text-align: center;
}
</style>
