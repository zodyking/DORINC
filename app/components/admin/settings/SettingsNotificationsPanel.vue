<script setup lang="ts">
import type { NotificationSettings, NotificationToggleKey } from '#shared/workspace-settings-defaults'
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

const sendHourOptions = Array.from({ length: 24 }, (_, hour) => {
  const h12 = hour % 12 || 12
  const ampm = hour < 12 ? 'AM' : 'PM'
  return {
    value: hour,
    label: `${h12}:00 ${ampm} UTC`,
  }
})

const busy = ref(false)
const sendBusy = ref(false)
const message = ref('')
const error = ref('')
const sendProgressLabel = ref('')
const sendSteps = ref<Array<{
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped'
  detail?: string
}>>([])

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendDailySummaryNow() {
  sendBusy.value = true
  message.value = ''
  error.value = ''
  sendProgressLabel.value = 'Preparing report…'
  sendSteps.value = [{
    id: 'prepare',
    title: 'Prepare daily summary',
    status: 'running',
  }]

  try {
    const prepared = await $fetch<{
      sessionId: string
      steps: Array<{ id: string, title: string }>
      susanReady: boolean
      susanSkipReason: string | null
      totalSteps: number
    }>('/api/admin/notifications/daily-summary/prepare', {
      method: 'POST',
    })

    sendSteps.value = [
      { id: 'prepare', title: 'Prepare daily summary', status: 'done' },
      ...prepared.steps.map(step => ({
        id: step.id,
        title: `Susan: ${step.title}`,
        status: 'pending' as const,
      })),
      { id: 'send', title: 'Send test email', status: 'pending' },
    ]

    let susanGenerated = 0
    let susanFailed = 0
    let lastSusanError: string | null = prepared.susanSkipReason

    if (!prepared.susanReady) {
      for (const step of sendSteps.value) {
        if (step.id !== 'prepare' && step.id !== 'send') {
          step.status = 'skipped'
          step.detail = prepared.susanSkipReason || 'Susan unavailable'
        }
      }
    }
    else {
      for (let i = 0; i < prepared.steps.length; i += 1) {
        const step = prepared.steps[i]!
        const row = sendSteps.value.find(s => s.id === step.id)
        if (row) {
          row.status = 'running'
          row.detail = undefined
        }
        sendProgressLabel.value = `Susan note ${i + 1} of ${prepared.steps.length}: ${step.title}`

        const result = await $fetch<{
          sectionId: string
          title: string
          ok: boolean
          usedDraft: boolean
          error: string | null
          susanGenerated: number
          susanFailed: number
        }>('/api/admin/notifications/daily-summary/susan-step', {
          method: 'POST',
          body: {
            sessionId: prepared.sessionId,
            sectionId: step.id,
            stepIndex: i + 1,
            totalSteps: prepared.totalSteps,
          },
        })

        susanGenerated = result.susanGenerated
        susanFailed = result.susanFailed
        if (row) {
          if (result.ok) {
            row.status = 'done'
            row.detail = 'Note written'
          }
          else {
            row.status = 'error'
            row.detail = result.error || 'Used draft'
            lastSusanError = result.error || lastSusanError
          }
        }

        // Keep OpenRouter from getting bursty even across separate HTTP calls.
        if (i < prepared.steps.length - 1) await sleep(1200)
      }
    }

    const sendRow = sendSteps.value.find(s => s.id === 'send')
    if (sendRow) sendRow.status = 'running'
    sendProgressLabel.value = 'Sending test email…'

    const res = await $fetch<{
      sent: number
      delivered: number
      failed: number
      skipped: string | null
      recipients: string[]
      errors: string[]
      delivery: 'direct' | 'queue'
      susanGenerated?: number
      susanFailed?: number
      susanSkippedReason?: string | null
    }>('/api/admin/notifications/daily-summary/send', {
      method: 'POST',
      body: { sessionId: prepared.sessionId },
    })

    if (sendRow) sendRow.status = res.delivered > 0 || res.sent > 0 ? 'done' : 'error'
    sendProgressLabel.value = ''

    if (res.skipped) {
      error.value = res.errors[0]
        || (res.skipped === 'no_recipients'
          ? 'Your account needs an email address to receive the test summary'
          : `Test summary not sent (${res.skipped})`)
      return
    }

    const generated = res.susanGenerated ?? susanGenerated
    const failedNotes = res.susanFailed ?? susanFailed
    const susanNote = generated > 0
      ? ` Susan wrote ${generated} section note${generated === 1 ? '' : 's'}.`
      : (res.susanSkippedReason || lastSusanError
          ? ` Susan notes used drafts (${res.susanSkippedReason || lastSusanError}).`
          : '')

    if (res.delivery === 'direct') {
      message.value = res.delivered > 0
        ? `Test summary emailed to you: ${res.recipients.join(', ')}.${susanNote}`
        : 'Test summary finished but SMTP reported no delivery'
      if (failedNotes > 0 || (generated === 0 && (res.susanSkippedReason || lastSusanError))) {
        error.value = res.susanSkippedReason || lastSusanError || res.errors[0] || `Susan calls failed (${failedNotes})`
      }
      else if (res.failed > 0 && res.errors.length) {
        error.value = res.errors.slice(0, 2).join(' · ')
      }
      return
    }

    message.value = `Test summary queued for you (${res.sent}).${susanNote}`
  }
  catch (e: unknown) {
    sendProgressLabel.value = ''
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not send test summary'
    for (const step of sendSteps.value) {
      if (step.status === 'running' || step.status === 'pending') step.status = 'error'
    }
  }
  finally {
    sendBusy.value = false
  }
}

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
    if (typeof form[key] === 'boolean') {
      ;(form as Record<NotificationToggleKey, boolean>)[key as NotificationToggleKey] = true
    }
  }
}

function disableAll() {
  for (const key of Object.keys(form) as Array<keyof NotificationSettings>) {
    if (typeof form[key] === 'boolean') {
      ;(form as Record<NotificationToggleKey, boolean>)[key as NotificationToggleKey] = false
    }
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

    <div class="card" style="margin-bottom:16px;">
      <div class="chead"><h3>Email Templates</h3></div>
      <div class="cbody settings-form">
        <p class="help" style="margin:0 0 12px;">
          Edit subject lines, headlines, and body copy for every transactional email type, then set the active template.
        </p>
        <div class="settings-actions">
          <NuxtLink class="btn primary" to="/templates/email">Open Email Template Editor</NuxtLink>
        </div>
      </div>
    </div>

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

          <div v-if="group.id === 'system'" class="notif-schedule">
            <label class="fld">
              Daily summary send time
              <select v-model.number="form.dailySummarySendHourUtc" :disabled="!form.dailySummaryReport">
                <option v-for="opt in sendHourOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <span class="help">
                Scheduled send goes once per day to all Admin and Manager accounts at this UTC hour (default 1:00 PM UTC).
                The test button emails only your account.
              </span>
            </label>
            <button
              type="button"
              class="btn"
              style="margin-top:10px;"
              :disabled="sendBusy || !form.dailySummaryReport"
              @click="sendDailySummaryNow"
            >
              {{ sendBusy ? (sendProgressLabel || 'Working…') : 'Send test to me' }}
            </button>
            <ol v-if="sendSteps.length" class="notif-progress">
              <li
                v-for="step in sendSteps"
                :key="step.id"
                class="notif-progress-item"
                :data-status="step.status"
              >
                <span class="notif-progress-mark">
                  {{
                    step.status === 'done' ? '✓'
                    : step.status === 'error' ? '!'
                      : step.status === 'running' ? '…'
                        : step.status === 'skipped' ? '–'
                          : '○'
                  }}
                </span>
                <span class="notif-progress-copy">
                  <strong>{{ step.title }}</strong>
                  <span v-if="step.detail" class="notif-progress-detail">{{ step.detail }}</span>
                </span>
              </li>
            </ol>
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

.notif-schedule {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.notif-schedule .fld {
  margin: 0;
}

.notif-progress {
  margin: 0.75rem 0 0;
  padding: 0.65rem 0.75rem;
  list-style: none;
  border: 1px solid #dbe4f0;
  border-radius: 10px;
  background: #fff;
  display: grid;
  gap: 0.4rem;
}

.notif-progress-item {
  display: grid;
  grid-template-columns: 1.15rem 1fr;
  gap: 0.45rem;
  align-items: start;
  font-size: 0.8rem;
  line-height: 1.35;
  color: #475569;
}

.notif-progress-mark {
  width: 1.15rem;
  text-align: center;
  font-weight: 700;
  color: #94a3b8;
}

.notif-progress-copy {
  display: grid;
  gap: 0.1rem;
}

.notif-progress-copy strong {
  font-weight: 600;
  color: #334155;
}

.notif-progress-detail {
  color: #64748b;
  word-break: break-word;
}

.notif-progress-item[data-status='running'] .notif-progress-mark,
.notif-progress-item[data-status='running'] .notif-progress-copy strong {
  color: #1d4ed8;
}

.notif-progress-item[data-status='done'] .notif-progress-mark {
  color: #15803d;
}

.notif-progress-item[data-status='error'] .notif-progress-mark,
.notif-progress-item[data-status='error'] .notif-progress-detail {
  color: #b91c1c;
}

.notif-progress-item[data-status='skipped'] .notif-progress-mark,
.notif-progress-item[data-status='skipped'] .notif-progress-detail {
  color: #b45309;
}
</style>
