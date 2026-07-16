<script setup lang="ts">
import { formatSessionCountdown } from '#shared/session-idle'

const idle = useAuthSessionIdle()

const countdownLabel = computed(() => formatSessionCountdown(idle.secondsRemaining.value))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="idle.warningVisible.value"
      class="modal-scrim open session-timeout-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-desc"
    >
      <div class="card modal-card session-timeout-card" @click.stop>
        <div class="chead">
          <h3 id="session-timeout-title">Still there?</h3>
        </div>
        <div class="cbody">
          <p id="session-timeout-desc" style="margin:0 0 12px; color:#475569; font-size:14px;">
            You have been inactive. For your security you will be signed out when the timer reaches zero.
            Open work will be saved automatically.
          </p>
          <p class="session-timeout-countdown" aria-live="polite">
            Signing out in <strong>{{ countdownLabel }}</strong>
          </p>
          <div class="session-timeout-actions">
            <button
              type="button"
              class="btn primary"
              :disabled="idle.signingOut.value"
              @click="idle.staySignedIn()"
            >
              Stay signed in
            </button>
            <button
              type="button"
              class="btn"
              :disabled="idle.signingOut.value"
              @click="idle.signOutNow()"
            >
              {{ idle.signingOut.value ? 'Signing out…' : 'Sign out now' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
