<script setup lang="ts">
import type { NotificationSettings } from '#shared/workspace-settings-defaults'
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_SETTING_META } from '#shared/workspace-settings-defaults'

const emit = defineEmits<{ saved: [] }>()

interface NotificationsResponse {
  settings: NotificationSettings
  meta: typeof NOTIFICATION_SETTING_META
}

const { data, refresh, pending } = useClientFetch<NotificationsResponse>('/api/admin/settings/notifications')

const form = reactive<NotificationSettings>({ ...DEFAULT_NOTIFICATION_SETTINGS })

watch(() => data.value?.settings, (s) => {
  if (!s) return
  Object.assign(form, s)
}, { immediate: true })

const meta = computed(() => data.value?.meta ?? NOTIFICATION_SETTING_META)

const groups = computed(() => {
  const order = ['security', 'workflow', 'customer', 'system'] as const
  const labels: Record<typeof order[number], string> = {
    security: 'Security & accounts',
    workflow: 'Staff workflow',
    customer: 'Customer communications',
    system: 'System',
  }
  return order.map(group => ({
    id: group,
    label: labels[group],
    items: meta.value.filter(item => item.group === group),
  })).filter(g => g.items.length)
})

const busy = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    await $fetch('/api/admin/settings/notifications', {
      method: 'PATCH',
      body: { ...form },
    })
    message.value = 'Notification settings saved'
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

function enableAll() {
  for (const key of Object.keys(form) as Array<keyof NotificationSettings>) {
    form[key] = true
  }
}

function disableAll() {
  for (const key of Object.keys(form) as Array<keyof NotificationSettings>) {
    form[key] = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Notifications</h3>
      <p>
        Toggle app-wide email notifications. Templates use your business name, address, and invoice logo from Business settings.
      </p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <div class="settings-actions" style="margin-bottom:12px;">
          <button type="button" class="btn" @click="enableAll">Enable all</button>
          <button type="button" class="btn" @click="disableAll">Disable all</button>
        </div>

        <div v-for="group in groups" :key="group.id" class="notif-group">
          <h4 class="notif-group-title">{{ group.label }}</h4>
          <div
            v-for="item in group.items"
            :key="item.key"
            class="tglrow"
          >
            <div>
              <div class="notif-label">{{ item.label }}</div>
              <div class="notif-desc">{{ item.description }}</div>
            </div>
            <span class="tgl">
              <input v-model="form[item.key]" type="checkbox">
              <span class="tr" />
            </span>
          </div>
        </div>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save notification settings' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';

.notif-group {
  margin-bottom: 18px;
}

.notif-group-title {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

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
