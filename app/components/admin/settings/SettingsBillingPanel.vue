<script setup lang="ts">
import type { BillingIntegrationsView } from '#shared/validators/billing-integrations'
import { BILLING_PROVIDER_ACCOUNT_URLS, BILLING_PROVIDER_LABELS, billingProviderManageLabel } from '~/utils/billing-ui'
import { FetchHardTimeoutError, fetchJsonWithHardTimeout } from '~/utils/fetch-json-hard-timeout'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { isSavedPasswordMask, passwordForSave, SAVED_PASSWORD_MASK } from '~/utils/settings-credentials'

const props = defineProps<{ active?: boolean }>()

const labels = BILLING_PROVIDER_LABELS

function openProviderAccount(provider: keyof typeof BILLING_PROVIDER_ACCOUNT_URLS) {
  window.open(BILLING_PROVIDER_ACCOUNT_URLS[provider], '_blank', 'noopener,noreferrer')
}

const emit = defineEmits<{ saved: [] }>()

interface IntegrationsResponse {
  settings: BillingIntegrationsView
}

interface VultrInstanceOption {
  id: string
  label: string
  region: string
  plan: string
  status: string
  mainIp: string | null
}

const { data, pending, refresh } = useClientFetch<IntegrationsResponse>(
  '/api/admin/billing/integrations',
  { immediate: false },
)

const integrationsLoaded = ref(false)

watch(() => props.active, (active) => {
  if (active && !integrationsLoaded.value) {
    integrationsLoaded.value = true
    void refresh()
  }
}, { immediate: true })

const form = reactive({
  vultrEnabled: false,
  vultrApiKey: '',
  vultrMonitoredInstanceIds: [] as string[],
  vultrUsername: '',
  vultrPassword: '',
  cloudflareEnabled: false,
  cloudflareAccountId: '',
  cloudflareApiToken: '',
  cloudflareUsername: '',
  cloudflarePassword: '',
  openrouterBillingEnabled: true,
  openrouterManagementKey: '',
  openrouterUsername: '',
  openrouterPassword: '',
})

let skipServerHydrate = false

function hydrate(s: BillingIntegrationsView) {
  form.vultrEnabled = s.vultrEnabled
  form.vultrApiKey = s.hasVultrApiKey ? SAVED_PASSWORD_MASK : ''
  form.vultrMonitoredInstanceIds = [...(s.vultrMonitoredInstanceIds ?? [])]
  form.vultrUsername = s.hasVultrUsername ? SAVED_PASSWORD_MASK : ''
  form.vultrPassword = s.hasVultrPassword ? SAVED_PASSWORD_MASK : ''
  form.cloudflareEnabled = s.cloudflareEnabled
  form.cloudflareAccountId = s.cloudflareAccountId ?? ''
  form.cloudflareApiToken = s.hasCloudflareApiToken ? SAVED_PASSWORD_MASK : ''
  form.cloudflareUsername = s.hasCloudflareUsername ? SAVED_PASSWORD_MASK : ''
  form.cloudflarePassword = s.hasCloudflarePassword ? SAVED_PASSWORD_MASK : ''
  form.openrouterBillingEnabled = s.openrouterBillingEnabled
  form.openrouterManagementKey = s.hasOpenrouterManagementKey ? SAVED_PASSWORD_MASK : ''
  form.openrouterUsername = s.hasOpenrouterUsername ? SAVED_PASSWORD_MASK : ''
  form.openrouterPassword = s.hasOpenrouterPassword ? SAVED_PASSWORD_MASK : ''
}

watch(() => data.value?.settings, (s) => {
  if (!s || skipServerHydrate) return
  hydrate(s)
}, { immediate: true })

const hasVultrKey = computed(() =>
  !!data.value?.settings.hasVultrApiKey
  || (!isSavedPasswordMask(form.vultrApiKey) && form.vultrApiKey.trim().length >= 8),
)

const hasCloudflareToken = computed(() =>
  !!data.value?.settings.hasCloudflareApiToken
  || (!isSavedPasswordMask(form.cloudflareApiToken) && form.cloudflareApiToken.trim().length >= 8),
)

function applySavedSettings(settings: BillingIntegrationsView) {
  skipServerHydrate = true
  if (data.value) {
    data.value = { settings }
  }
  hydrate(settings)
  nextTick(() => {
    skipServerHydrate = false
  })
}

const SAVE_TIMEOUT_MS = 30_000
const PROVIDER_LIST_TIMEOUT_MS = 20_000

let saveAbort: AbortController | null = null
let vultrAbort: AbortController | null = null

const vultrInstances = ref<VultrInstanceOption[]>([])
const vultrInstancesLoading = ref(false)
const vultrInstancesError = ref('')

function cancelVultrLoad() {
  vultrAbort?.abort()
  vultrAbort = null
  vultrInstancesLoading.value = false
}

async function loadVultrInstances() {
  if (!hasVultrKey.value || vultrInstancesLoading.value) return
  cancelVultrLoad()
  vultrAbort = new AbortController()
  vultrInstancesLoading.value = true
  vultrInstancesError.value = ''
  try {
    const res = await $fetch<{ instances: VultrInstanceOption[] }>('/api/admin/billing/vultr/instances', {
      timeout: PROVIDER_LIST_TIMEOUT_MS,
      signal: vultrAbort.signal,
    })
    vultrInstances.value = res.instances
  }
  catch (e: unknown) {
    if ((e as Error).name === 'AbortError') return
    vultrInstancesError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load Vultr instances'
  }
  finally {
    vultrInstancesLoading.value = false
  }
}

function billingSaveErrorMessage(e: unknown, fallback: string): string {
  const payload = (e as {
    data?: {
      message?: string
      details?: { issues?: Array<{ path?: string, message?: string }> }
    }
  })?.data
  const issue = payload?.details?.issues?.find(row => row.message)
  if (issue) {
    const path = issue.path ? `${issue.path}: ` : ''
    return `${path}${issue.message}`
  }
  return syncFetchErrorMessage(e, fallback)
}

function toggleInstance(id: string, checked: boolean) {
  const set = new Set(form.vultrMonitoredInstanceIds)
  if (checked) set.add(id)
  else set.delete(id)
  form.vultrMonitoredInstanceIds = [...set]
}

function appendCredentialFields(
  body: Record<string, unknown>,
  key: string,
  value: string,
  alreadySaved: boolean,
) {
  const next = passwordForSave(value, alreadySaved)
  if (next) body[key] = next
}

function buildSaveBody(): Record<string, unknown> {
  const settings = data.value?.settings
  const body: Record<string, unknown> = {
    vultrEnabled: form.vultrEnabled,
    vultrMonitoredInstanceIds: form.vultrMonitoredInstanceIds,
    cloudflareEnabled: form.cloudflareEnabled,
    cloudflareAccountId: form.cloudflareAccountId.trim() || undefined,
    openrouterBillingEnabled: form.openrouterBillingEnabled,
  }

  appendCredentialFields(body, 'vultrApiKey', form.vultrApiKey, !!settings?.hasVultrApiKey)
  appendCredentialFields(body, 'vultrUsername', form.vultrUsername, !!settings?.hasVultrUsername)
  appendCredentialFields(body, 'vultrPassword', form.vultrPassword, !!settings?.hasVultrPassword)
  appendCredentialFields(body, 'cloudflareApiToken', form.cloudflareApiToken, !!settings?.hasCloudflareApiToken)
  appendCredentialFields(body, 'cloudflareUsername', form.cloudflareUsername, !!settings?.hasCloudflareUsername)
  appendCredentialFields(body, 'cloudflarePassword', form.cloudflarePassword, !!settings?.hasCloudflarePassword)
  appendCredentialFields(body, 'openrouterManagementKey', form.openrouterManagementKey, !!settings?.hasOpenrouterManagementKey)
  appendCredentialFields(body, 'openrouterUsername', form.openrouterUsername, !!settings?.hasOpenrouterUsername)
  appendCredentialFields(body, 'openrouterPassword', form.openrouterPassword, !!settings?.hasOpenrouterPassword)

  return body
}

const saveBusy = ref(false)
const testBusy = ref<'vultr' | 'cloudflare' | null>(null)
const message = ref('')
const error = ref('')

async function save() {
  if (saveBusy.value || pending.value) return

  saveBusy.value = true
  message.value = ''
  error.value = ''

  cancelVultrLoad()
  saveAbort?.abort()
  saveAbort = new AbortController()

  try {
    if (!integrationsLoaded.value) {
      integrationsLoaded.value = true
      await refresh()
    }

    const res = await fetchJsonWithHardTimeout<IntegrationsResponse>(
      '/api/admin/billing/integrations',
      {
        method: 'PATCH',
        body: buildSaveBody(),
        timeoutMs: SAVE_TIMEOUT_MS,
        signal: saveAbort.signal,
      },
    )
    if (!res?.settings?.id) {
      throw new Error('Server returned an invalid billing settings response')
    }
    applySavedSettings(res.settings)
    message.value = 'Billing settings saved'
    emit('saved')
  }
  catch (e: unknown) {
    if (e instanceof FetchHardTimeoutError || (e as Error).name === 'AbortError') {
      error.value = 'Save timed out. Wait for the page to finish loading, then try again.'
    }
    else {
      error.value = billingSaveErrorMessage(e, 'Save failed')
    }
  }
  finally {
    saveAbort = null
    saveBusy.value = false
  }
}

async function testVultrConnection() {
  if (testBusy.value || saveBusy.value) return

  testBusy.value = 'vultr'
  message.value = ''
  error.value = ''
  cancelVultrLoad()

  try {
    const body: Record<string, unknown> = { provider: 'vultr' }
    const key = passwordForSave(form.vultrApiKey, !!data.value?.settings.hasVultrApiKey)
    if (key) body.vultrApiKey = key
    const res = await $fetch<{ message: string }>('/api/admin/billing/test-connection', {
      method: 'POST',
      body,
      timeout: PROVIDER_LIST_TIMEOUT_MS,
    })
    message.value = res.message
  }
  catch (e: unknown) {
    error.value = billingSaveErrorMessage(e, 'Connection test failed')
  }
  finally {
    testBusy.value = null
  }
}

async function testCloudflareConnection() {
  if (testBusy.value || saveBusy.value) return

  testBusy.value = 'cloudflare'
  message.value = ''
  error.value = ''

  try {
    const body: Record<string, unknown> = {
      provider: 'cloudflare',
      cloudflareAccountId: form.cloudflareAccountId.trim() || undefined,
    }
    const token = passwordForSave(form.cloudflareApiToken, !!data.value?.settings.hasCloudflareApiToken)
    if (token) body.cloudflareApiToken = token
    const res = await $fetch<{ message: string }>('/api/admin/billing/test-connection', {
      method: 'POST',
      body,
      timeout: PROVIDER_LIST_TIMEOUT_MS,
    })
    message.value = res.message
  }
  catch (e: unknown) {
    error.value = billingSaveErrorMessage(e, 'Connection test failed')
  }
  finally {
    testBusy.value = null
  }
}

onBeforeUnmount(() => {
  saveAbort?.abort()
  cancelVultrLoad()
})
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Infrastructure billing</h3>
      <p>
        Connect providers for the billing dashboard. API keys and portal logins are encrypted in PostgreSQL.
        Portal username/password can be revealed on the Billing page after entering your account password.
      </p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <div v-else class="stack">
      <div class="card provider-settings-card">
        <div class="chead provider-card-head">
          <div>
            <h3>{{ labels.vultr.name }}</h3>
            <span class="provider-category">{{ labels.vultr.category }}</span>
          </div>
        </div>
        <div class="cbody settings-form">
          <div class="tglrow">
            <div>
              <div class="notif-label">Enable monitoring</div>
              <div class="notif-desc">Balance, usage, and invoice history.</div>
            </div>
            <span class="tgl">
              <input v-model="form.vultrEnabled" type="checkbox">
              <span class="tr" />
            </span>
          </div>
          <div class="settings-field-block">
            <label class="fld">
              API key
              <input v-model="form.vultrApiKey" type="password" maxlength="512" autocomplete="off" placeholder="Vultr API token">
            </label>
            <div class="settings-actions">
              <button type="button" class="btn" :disabled="!!testBusy || saveBusy" @click="testVultrConnection">
                {{ testBusy === 'vultr' ? 'Testing…' : 'Test connection' }}
              </button>
            </div>
          </div>

          <div class="settings-field-block">
            <div class="notif-label">Portal login (optional)</div>
            <div class="notif-desc">Stored for quick lookup on the Billing page behind your account password.</div>
            <div class="credential-grid">
              <label class="fld">
                Username
                <input v-model="form.vultrUsername" type="text" maxlength="512" autocomplete="off" placeholder="Account username / email">
              </label>
              <label class="fld">
                Password
                <input v-model="form.vultrPassword" type="password" maxlength="512" autocomplete="off" placeholder="Account password">
              </label>
            </div>
          </div>

          <template v-if="hasVultrKey && form.vultrEnabled">
            <div class="settings-field-block">
              <div class="notif-label">Monitored servers</div>
              <button type="button" class="btn sm" :disabled="vultrInstancesLoading || saveBusy" @click="loadVultrInstances">
                {{ vultrInstancesLoading ? 'Loading…' : 'Refresh list' }}
              </button>
              <p v-if="vultrInstancesError" class="settings-err">{{ vultrInstancesError }}</p>
              <div v-if="vultrInstances.length" class="picker-list">
                <label v-for="inst in vultrInstances" :key="inst.id" class="settings-check">
                  <input
                    type="checkbox"
                    :checked="form.vultrMonitoredInstanceIds.includes(inst.id)"
                    @change="toggleInstance(inst.id, ($event.target as HTMLInputElement).checked)"
                  >
                  <span>
                    <b>{{ inst.label || inst.id }}</b>
                    <small>{{ inst.region }} · {{ inst.plan }} · {{ inst.status }}</small>
                  </span>
                </label>
              </div>
            </div>
          </template>
        </div>
        <footer class="provider-settings-footer">
          <button type="button" class="btn provider-manage-btn" @click="openProviderAccount('vultr')">
            {{ billingProviderManageLabel('vultr') }}
          </button>
        </footer>
      </div>

      <div class="card provider-settings-card">
        <div class="chead provider-card-head">
          <div>
            <h3>{{ labels.cloudflare.name }}</h3>
            <span class="provider-category">{{ labels.cloudflare.category }}</span>
          </div>
        </div>
        <div class="cbody settings-form">
          <div class="tglrow">
            <div>
              <div class="notif-label">Enable monitoring</div>
              <div class="notif-desc">Registrar domains, expiry, lock, privacy, and renewal estimates.</div>
            </div>
            <span class="tgl">
              <input v-model="form.cloudflareEnabled" type="checkbox">
              <span class="tr" />
            </span>
          </div>
          <div class="settings-field-block">
            <label class="fld">
              Account ID
              <input
                v-model="form.cloudflareAccountId"
                type="text"
                maxlength="64"
                autocomplete="off"
                placeholder="Cloudflare account ID"
                class="mono"
              >
            </label>
            <label class="fld">
              API token
              <input
                v-model="form.cloudflareApiToken"
                type="password"
                maxlength="512"
                autocomplete="off"
                placeholder="API token with Registrar read"
              >
            </label>
            <p class="settings-help">
              Create a token with Registrar:Read (and Account:Read if needed) at dash.cloudflare.com → My Profile → API Tokens.
            </p>
            <div class="settings-actions">
              <button
                type="button"
                class="btn"
                :disabled="!!testBusy || saveBusy || !form.cloudflareAccountId.trim() || !hasCloudflareToken"
                @click="testCloudflareConnection"
              >
                {{ testBusy === 'cloudflare' ? 'Testing…' : 'Test connection' }}
              </button>
            </div>
          </div>

          <div class="settings-field-block">
            <div class="notif-label">Portal login (optional)</div>
            <div class="notif-desc">Stored for quick lookup on the Billing page behind your account password.</div>
            <div class="credential-grid">
              <label class="fld">
                Username
                <input v-model="form.cloudflareUsername" type="text" maxlength="512" autocomplete="off" placeholder="Cloudflare login email">
              </label>
              <label class="fld">
                Password
                <input v-model="form.cloudflarePassword" type="password" maxlength="512" autocomplete="off" placeholder="Account password">
              </label>
            </div>
          </div>
        </div>
        <footer class="provider-settings-footer">
          <button type="button" class="btn provider-manage-btn" @click="openProviderAccount('cloudflare')">
            {{ billingProviderManageLabel('cloudflare') }}
          </button>
        </footer>
      </div>

      <div class="card provider-settings-card">
        <div class="chead provider-card-head">
          <div>
            <h3>{{ labels.openrouter.name }}</h3>
            <span class="provider-category">{{ labels.openrouter.category }}</span>
          </div>
        </div>
        <div class="cbody settings-form">
          <div class="tglrow">
            <div>
              <div class="notif-label">Enable monitoring</div>
              <div class="notif-desc">
                Usage comes from the AI key in
                <NuxtLink to="/admin?tab=ai">Control Panel → AI</NuxtLink>.
              </div>
            </div>
            <span class="tgl">
              <input v-model="form.openrouterBillingEnabled" type="checkbox">
              <span class="tr" />
            </span>
          </div>
          <div class="settings-field-block">
            <p v-if="data?.settings.hasAiOpenRouterKey" class="settings-help">AI API key is configured.</p>
            <p v-else class="settings-err">Add an OpenRouter key in Control Panel → AI first.</p>
            <label class="fld">
              Management API key
              <input
                v-model="form.openrouterManagementKey"
                type="password"
                maxlength="512"
                autocomplete="off"
                placeholder="OpenRouter management key for account credits"
              >
            </label>
            <p class="settings-help">Optional. Required to show available account credit on the Billing page.</p>
          </div>

          <div class="settings-field-block">
            <div class="notif-label">Portal login (optional)</div>
            <div class="notif-desc">Stored for quick lookup on the Billing page behind your account password.</div>
            <div class="credential-grid">
              <label class="fld">
                Username
                <input v-model="form.openrouterUsername" type="text" maxlength="512" autocomplete="off" placeholder="Account username / email">
              </label>
              <label class="fld">
                Password
                <input v-model="form.openrouterPassword" type="password" maxlength="512" autocomplete="off" placeholder="Account password">
              </label>
            </div>
          </div>
        </div>
        <footer class="provider-settings-footer">
          <button type="button" class="btn provider-manage-btn" @click="openProviderAccount('openrouter')">
            {{ billingProviderManageLabel('openrouter') }}
          </button>
        </footer>
      </div>

      <p v-if="message" class="settings-ok">{{ message }}</p>
      <p v-if="error" class="settings-err">{{ error }}</p>

      <div class="settings-actions billing-save-bar">
        <button type="button" class="btn primary" :disabled="saveBusy || !!testBusy || pending" @click="save">
          {{ pending ? 'Loading…' : saveBusy ? 'Saving…' : 'Save billing settings' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './settings-panel.css';

.stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.provider-settings-card {
  display: flex;
  flex-direction: column;
}

.provider-settings-footer {
  padding: 16px 18px 18px;
  margin-top: auto;
  border-top: 1px solid #e2e8f0;
}

.provider-manage-btn {
  width: 100%;
  justify-content: center;
  font-weight: 600;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-field-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 18px;
  margin-top: 4px;
  border-top: 1px solid #e2e8f0;
}

.credential-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 720px) {
  .credential-grid {
    grid-template-columns: 1fr;
  }
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
  max-width: 52ch;
}

.tglrow {
  align-items: flex-start;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.picker-list small {
  display: block;
  font-weight: 400;
  color: #64748b;
  font-size: 12px;
  margin-top: 2px;
}

.btn.sm {
  align-self: flex-start;
  font-size: 12px;
  padding: 6px 10px;
}

.provider-card-head {
  display: flex;
  align-items: flex-start;
}

.provider-card-head h3 {
  margin: 0;
}

.provider-category {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #0f766e;
}

.billing-save-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, rgba(248, 250, 252, 0) 0%, #f8fafc 28%);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
