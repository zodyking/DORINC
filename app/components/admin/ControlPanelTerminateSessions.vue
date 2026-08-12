<script setup lang="ts">
import { runSessionSaveHandlers } from '~/composables/useSessionLogoutHandlers'
import { redirectToSessionTerminated } from '~/utils/auth-session'

const auth = useAuthStore()
const busy = ref(false)
const confirmOpen = ref(false)
const errorMsg = ref('')

async function terminateAllSessions() {
  if (busy.value) return
  busy.value = true
  errorMsg.value = ''
  try {
    // Save this admin's open editors before the cookie dies.
    await runSessionSaveHandlers()
    await auth.releaseEditingSessions()
    await $fetch('/api/admin/security/terminate-all-sessions', { method: 'POST' })
    // Local clear without another redirect race — go straight to the notice page.
    auth.user = null
    auth.permissions = []
    auth.trainingGate = null
    auth.announcementGate = null
    auth.loaded = true
    await redirectToSessionTerminated()
  }
  catch (e: unknown) {
    errorMsg.value = (e as { data?: { message?: string } })?.data?.message
      ?? 'Could not terminate sessions'
    confirmOpen.value = false
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card">
    <div class="chead">
      <h3>Terminate All Sessions</h3>
    </div>
    <div class="cbody" style="padding-top:14px;">
      <p class="help" style="margin-top:0;">
        Immediately signs out <b>every</b> signed-in user, including you.
        Open work is saved when possible, then everyone is sent to a termination notice.
      </p>

      <div v-if="!confirmOpen" class="term-all-actions">
        <button
          type="button"
          class="btn danger"
          :disabled="busy"
          @click="confirmOpen = true"
        >
          Terminate All Sessions
        </button>
      </div>

      <div v-else class="term-all-confirm">
        <p>
          This will revoke all active sessions right now. Continue?
        </p>
        <div class="term-all-confirm__foot">
          <button type="button" class="btn sm" :disabled="busy" @click="confirmOpen = false">
            Cancel
          </button>
          <button type="button" class="btn sm danger" :disabled="busy" @click="terminateAllSessions">
            {{ busy ? 'Terminating…' : 'Yes, Terminate All Sessions' }}
          </button>
        </div>
      </div>

      <p v-if="errorMsg" class="help" style="color:#b91c1c; margin:12px 0 0;">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<style scoped>
.term-all-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.term-all-confirm {
  padding: 12px 14px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #7f1d1d;
  font-size: 0.92rem;
  line-height: 1.45;
}

.term-all-confirm p {
  margin: 0 0 10px;
}

.term-all-confirm__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
