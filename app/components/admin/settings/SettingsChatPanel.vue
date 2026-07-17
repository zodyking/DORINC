<script setup lang="ts">
import type { ChatWorkspaceSettings } from '#shared/workspace-settings-defaults'
import { DEFAULT_CHAT_SETTINGS } from '#shared/workspace-settings-defaults'

const emit = defineEmits<{ saved: [] }>()

interface ChatSettingsResponse {
  settings: ChatWorkspaceSettings
}

const { data, refresh, pending } = useClientFetch<ChatSettingsResponse>('/api/admin/settings/chat')

const form = reactive<ChatWorkspaceSettings>({ ...DEFAULT_CHAT_SETTINGS })

watch(() => data.value?.settings, (s) => {
  if (!s) return
  Object.assign(form, s)
}, { immediate: true })

const busy = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    await $fetch('/api/admin/settings/chat', {
      method: 'PATCH',
      body: { ...form },
    })
    message.value = 'Chat settings saved'
    await refresh()
    emit('saved')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Chat</h3>
      <p>
        Team chat is always available. Enable direct messaging to let staff start private one-on-one conversations.
      </p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <div class="tglrow">
          <div>
            <div class="notif-label">Direct messaging</div>
            <div class="notif-desc">
              When off, the Team tab opens the shared team conversation directly. Staff cannot browse or start private DMs.
            </div>
          </div>
          <span class="tgl">
            <input v-model="form.directMessagingEnabled" type="checkbox">
            <span class="tr" />
          </span>
        </div>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save chat settings' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';

.notif-label {
  font-size: 13.5px;
  font-weight: 600;
  color: #0f172a;
}

.notif-desc {
  margin-top: 2px;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.4;
  max-width: 48ch;
}

.tglrow {
  align-items: flex-start;
}
</style>
