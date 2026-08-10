<script setup lang="ts">
import { isSavedPasswordMask, passwordForSave, SAVED_PASSWORD_MASK } from '~/utils/settings-credentials'
import { formatPhoneDisplay } from '~/utils/phone-ui'

const emit = defineEmits<{ saved: [] }>()

interface QuoView {
  enabled: boolean
  hasApiKey: boolean
  fromNumber: string | null
  configured: boolean
}

interface QuoPhoneOption {
  id: string
  number: string
  formattedNumber?: string | null
  name?: string | null
}

interface SmsTemplateListItem {
  typeKey: string
  name: string
  description: string
  group: string
  isActive: boolean
  hasCustomContent: boolean
  bodyPreview: string
}

interface SmsTemplateDetail {
  typeKey: string
  name: string
  description: string
  isActive: boolean
  content: { body: string }
  defaults: { body: string }
  variables: Array<{ key: string, label: string }>
}

const { data: quoData, refresh } = useClientFetch<QuoView>('/api/admin/system/quo-settings')

const form = reactive({
  enabled: false,
  apiKey: '',
  fromNumber: '',
})

const phoneOptions = ref<QuoPhoneOption[]>([])
const numbersLoaded = ref(false)

function normalizeOptionNumber(raw: string | null | undefined): string {
  return String(raw ?? '').trim()
}

function optionLabel(row: QuoPhoneOption): string {
  const raw = row.formattedNumber?.trim() || row.number
  const number = formatPhoneDisplay(raw) || raw
  const name = row.name?.trim()
  return name ? `${number} — ${name}` : number
}

function applyPhoneOptions(rows: QuoPhoneOption[]) {
  phoneOptions.value = rows
    .map(row => ({
      ...row,
      number: normalizeOptionNumber(row.number),
    }))
    .filter(row => row.number)
  numbersLoaded.value = true

  const current = form.fromNumber.trim()
  const match = phoneOptions.value.find(row => row.number === current)
  if (match) {
    form.fromNumber = match.number
    return
  }
  if (!current && phoneOptions.value.length === 1) {
    form.fromNumber = phoneOptions.value[0]!.number
  }
}

watch(() => quoData.value, (q) => {
  if (!q) return
  form.enabled = q.enabled
  form.fromNumber = q.fromNumber ?? ''
  form.apiKey = q.hasApiKey ? SAVED_PASSWORD_MASK : ''
}, { immediate: true })

const fromNumberSelectOptions = computed(() => {
  const options = [...phoneOptions.value]
  const current = form.fromNumber.trim()
  if (current && !options.some(row => row.number === current)) {
    options.unshift({
      id: 'saved',
      number: current,
      formattedNumber: current,
      name: numbersLoaded.value ? 'Saved (not in latest Quo list)' : 'Saved',
    })
  }
  return options
})

const testTo = ref('')

const saveBusy = ref(false)
const testBusy = ref(false)
const testSmsBusy = ref(false)
const message = ref('')
const error = ref('')

const { data: templatesData, refresh: refreshTemplates } = useClientFetch<{ items: SmsTemplateListItem[] }>(
  '/api/sms-templates',
)
const templates = computed(() => templatesData.value?.items ?? [])
const selectedKey = ref('')
const detail = ref<SmsTemplateDetail | null>(null)
const draftBody = ref('')
const previewBody = ref('')
const templateBusy = ref(false)
const templateMessage = ref('')
const templateError = ref('')

watch(templates, (items) => {
  if (!selectedKey.value && items.length) selectedKey.value = items[0]!.typeKey
}, { immediate: true })

watch(selectedKey, async (key) => {
  if (!key) return
  templateError.value = ''
  templateMessage.value = ''
  try {
    detail.value = await $fetch<SmsTemplateDetail>(`/api/sms-templates/${key}`)
    draftBody.value = detail.value.content.body
    await runPreview()
  }
  catch (e: unknown) {
    templateError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load template'
  }
})

async function save() {
  saveBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const body: Record<string, unknown> = {
      enabled: form.enabled,
      fromNumber: form.fromNumber.trim() || undefined,
    }
    const nextKey = passwordForSave(form.apiKey, !!quoData.value?.hasApiKey)
    if (nextKey !== undefined) body.apiKey = nextKey
    const res = await $fetch<QuoView>('/api/admin/system/quo-settings', { method: 'PATCH', body })
    if (quoData.value?.hasApiKey || nextKey) form.apiKey = SAVED_PASSWORD_MASK
    else form.apiKey = ''
    form.enabled = res.enabled
    form.fromNumber = res.fromNumber ?? ''
    message.value = res.enabled
      ? 'Quo SMS saved and enabled'
      : 'Quo settings saved (enable after credentials are complete)'
    await refresh()
    emit('saved')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    saveBusy.value = false
  }
}

async function runTest() {
  testBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const body: Record<string, string> = {}
    if (form.apiKey.trim() && !isSavedPasswordMask(form.apiKey)) {
      body.apiKey = form.apiKey.trim()
    }
    const res = await $fetch<{
      ok: boolean
      message: string
      phoneNumbers?: QuoPhoneOption[]
    }>('/api/admin/system/quo-test', {
      method: 'POST',
      body,
    })
    message.value = res.message
    if (res.ok) {
      applyPhoneOptions(res.phoneNumbers ?? [])
      if (!phoneOptions.value.length) {
        form.fromNumber = ''
      }
    }
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Quo connection test failed'
  }
  finally {
    testBusy.value = false
  }
}

async function runTestSms() {
  testSmsBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/admin/system/quo-test-sms', {
      method: 'POST',
      body: { to: testTo.value.trim() || undefined },
    })
    message.value = res.message
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Test SMS failed'
  }
  finally {
    testSmsBusy.value = false
  }
}

async function runPreview() {
  if (!selectedKey.value) return
  try {
    const res = await $fetch<{ body: string }>(`/api/sms-templates/${selectedKey.value}/preview`, {
      method: 'POST',
      body: { content: { body: draftBody.value } },
    })
    previewBody.value = res.body
  }
  catch {
    previewBody.value = draftBody.value
  }
}

async function saveTemplate(activate?: boolean) {
  if (!selectedKey.value) return
  templateBusy.value = true
  templateMessage.value = ''
  templateError.value = ''
  try {
    detail.value = await $fetch<SmsTemplateDetail>(`/api/sms-templates/${selectedKey.value}`, {
      method: 'PATCH',
      body: {
        content: { body: draftBody.value },
        ...(activate !== undefined ? { activate } : {}),
      },
    })
    draftBody.value = detail.value.content.body
    templateMessage.value = activate === true
      ? 'SMS template saved and activated'
      : activate === false
        ? 'SMS template saved and deactivated'
        : 'SMS template saved'
    await refreshTemplates()
    await runPreview()
  }
  catch (e: unknown) {
    templateError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    templateBusy.value = false
  }
}

async function resetTemplate() {
  if (!selectedKey.value) return
  templateBusy.value = true
  templateMessage.value = ''
  templateError.value = ''
  try {
    detail.value = await $fetch<SmsTemplateDetail>(`/api/sms-templates/${selectedKey.value}/reset`, {
      method: 'POST',
    })
    draftBody.value = detail.value.content.body
    templateMessage.value = 'Reset to default copy'
    await refreshTemplates()
    await runPreview()
  }
  catch (e: unknown) {
    templateError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Reset failed'
  }
  finally {
    templateBusy.value = false
  }
}

const charCount = computed(() => draftBody.value.length)
const variableHelp = computed(() => {
  const vars = detail.value?.variables ?? []
  if (!vars.length) return `${charCount.value} / 480 characters`
  const list = vars.map(v => `{{${v.key}}}`).join(', ')
  return `${charCount.value} / 480 characters · variables: ${list}`
})
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Quo (SMS)</h3>
      <p>
        Outbound text messages for sign-in alerts, verification codes, and chat notifications.
        Uses the <a href="https://www.quo.com/docs/mdx/api-reference/introduction" target="_blank" rel="noopener">Quo API</a>
        (formerly OpenPhone). Enable only after the API key and from-number are saved.
      </p>
    </header>

    <form class="card" @submit.prevent="save">
      <div class="cbody settings-form">
        <label class="msg-pref-row quo-enable-row">
          <span class="msg-pref-text">
            <b>Enable Quo SMS</b>
            <small>When on, signup asks for a phone number and users can choose text vs email for security notifications. Account phone is always available.</small>
          </span>
          <input v-model="form.enabled" type="checkbox" class="msg-pref-check">
        </label>

        <label class="fld">
          API key
          <input
            v-model="form.apiKey"
            type="password"
            maxlength="512"
            :placeholder="quoData?.hasApiKey ? 'Saved — leave as-is to keep current key' : 'Quo API key'"
            autocomplete="off"
          >
          <span v-if="quoData?.hasApiKey && isSavedPasswordMask(form.apiKey)" class="help">
            API key is saved. Replace only if you want to change it.
          </span>
        </label>

        <label class="fld">
          From number
          <select
            v-model="form.fromNumber"
            :disabled="!fromNumberSelectOptions.length"
          >
            <option disabled value="">
              {{
                numbersLoaded
                  ? (fromNumberSelectOptions.length ? 'Select a Quo number' : 'No Quo numbers found — check workspace')
                  : 'Save API key, then Test connection to load numbers'
              }}
            </option>
            <option
              v-for="row in fromNumberSelectOptions"
              :key="row.id || row.number"
              :value="row.number"
            >
              {{ optionLabel(row) }}
            </option>
          </select>
          <span class="help">
            Numbers load from Quo after a successful connection test. Pick the line used to send SMS.
          </span>
        </label>

        <p v-if="message" class="settings-ok">{{ message }}</p>
        <p v-if="error" class="settings-err">{{ error }}</p>

        <div class="settings-actions">
          <button type="submit" class="btn primary" :disabled="saveBusy">
            {{ saveBusy ? 'Saving…' : 'Save Quo settings' }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="testBusy || !(quoData?.hasApiKey || (form.apiKey.trim() && !isSavedPasswordMask(form.apiKey)))"
            @click="runTest"
          >
            {{ testBusy ? 'Testing…' : 'Test connection' }}
          </button>
        </div>
      </div>
    </form>

    <div class="card" style="margin-top:16px;">
      <div class="chead"><h3>Send test SMS</h3></div>
      <div class="cbody settings-form">
        <label class="fld">
          Send test to
          <input
            v-model="testTo"
            type="tel"
            placeholder="(212) 203 7378 (or leave blank for your account phone)"
            @blur="testTo = testTo ? formatPhoneDisplay(testTo) : ''"
          >
        </label>
        <button type="button" class="btn" :disabled="testSmsBusy" @click="runTestSms">
          {{ testSmsBusy ? 'Sending…' : 'Send test SMS' }}
        </button>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="chead">
        <h3>SMS message templates</h3>
      </div>
      <div class="cbody settings-form">
        <p class="settings-help">
          Keep copy short for mobile. Activate a template to override the built-in default at send time.
        </p>

        <div class="quo-template-layout">
          <ul class="quo-template-list">
            <li
              v-for="item in templates"
              :key="item.typeKey"
              :class="{ on: item.typeKey === selectedKey }"
            >
              <button type="button" @click="selectedKey = item.typeKey">
                <span class="quo-template-name">{{ item.name }}</span>
                <span class="quo-template-meta">
                  <span v-if="item.isActive" class="pill ok">Active</span>
                  <span v-else class="pill muted">Default</span>
                </span>
              </button>
            </li>
          </ul>

          <div v-if="detail" class="quo-template-editor">
            <p class="settings-help">{{ detail.description }}</p>
            <label class="fld">
              Message body
              <textarea
                v-model="draftBody"
                rows="5"
                maxlength="480"
                @input="runPreview()"
              />
              <span class="help">{{ variableHelp }}</span>
            </label>

            <div class="quo-preview">
              <b>Preview</b>
              <p>{{ previewBody || '—' }}</p>
            </div>

            <p v-if="templateMessage" class="settings-ok">{{ templateMessage }}</p>
            <p v-if="templateError" class="settings-err">{{ templateError }}</p>

            <div class="settings-actions">
              <button type="button" class="btn primary" :disabled="templateBusy" @click="saveTemplate(true)">
                {{ templateBusy ? 'Saving…' : 'Save & activate' }}
              </button>
              <button type="button" class="btn" :disabled="templateBusy" @click="saveTemplate()">
                Save draft
              </button>
              <button type="button" class="btn" :disabled="templateBusy" @click="resetTemplate">
                Reset default
              </button>
              <button
                v-if="detail.isActive"
                type="button"
                class="btn"
                :disabled="templateBusy"
                @click="saveTemplate(false)"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './settings-panel.css';

.quo-enable-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
}

.msg-pref-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.msg-pref-text b { font-size: 14px; }
.msg-pref-text small { color: var(--muted, #6b7280); font-size: 12px; line-height: 1.4; }
.msg-pref-check { width: 18px; height: 18px; margin-top: 2px; }

.quo-template-layout {
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr;
  gap: 16px;
}

@media (max-width: 720px) {
  .quo-template-layout { grid-template-columns: 1fr; }
}

.quo-template-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quo-template-list button {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quo-template-list li.on button {
  border-color: var(--border, #d1d5db);
  background: var(--surface-2, #f9fafb);
}

.quo-template-name { font-size: 13px; font-weight: 600; }
.quo-template-meta { display: flex; gap: 6px; }

.quo-preview {
  margin: 8px 0 12px;
  padding: 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #f8fafc;
}

.quo-preview b {
  display: block;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 6px;
}

.quo-preview p {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
}

textarea {
  width: 100%;
  font: inherit;
  line-height: 1.4;
  resize: vertical;
}
</style>
