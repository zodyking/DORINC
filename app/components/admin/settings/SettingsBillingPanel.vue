<script setup lang="ts">
import type { BillingIntegrationsView, NamecheapManualDomain } from '#shared/validators/billing-integrations'
import { BILLING_PROVIDER_LABELS } from '~/utils/billing-ui'
import { isSavedPasswordMask, passwordForSave, SAVED_PASSWORD_MASK } from '~/utils/settings-credentials'

const labels = BILLING_PROVIDER_LABELS

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

const { data, refresh, pending } = useClientFetch<IntegrationsResponse>('/api/admin/billing/integrations')

interface ManualDomainFormRow {
  name: string
  renewalDate: string
  renewalCost: string
}

const form = reactive({
  vultrEnabled: false,
  vultrApiKey: '',
  vultrMonitoredInstanceIds: [] as string[],
  namecheapManualDomains: [] as ManualDomainFormRow[],
  openrouterBillingEnabled: true,
  openrouterManagementKey: '',
})

function manualDomainToForm(row: NamecheapManualDomain): ManualDomainFormRow {
  return {
    name: row.name,
    renewalDate: row.renewalDate,
    renewalCost: String(row.renewalCost),
  }
}

function formManualDomainsForSave(): NamecheapManualDomain[] {
  return form.namecheapManualDomains
    .map(row => ({
      name: row.name.trim(),
      renewalDate: row.renewalDate.trim(),
      renewalCost: Number(row.renewalCost),
    }))
    .filter(row =>
      row.name.length >= 3
      && /^\d{4}-\d{2}-\d{2}$/.test(row.renewalDate)
      && Number.isFinite(row.renewalCost)
      && row.renewalCost >= 0,
    )
}

function hydrate(s: BillingIntegrationsView) {
  form.vultrEnabled = s.vultrEnabled
  form.vultrApiKey = s.hasVultrApiKey ? SAVED_PASSWORD_MASK : ''
  form.vultrMonitoredInstanceIds = [...s.vultrMonitoredInstanceIds]
  form.namecheapManualDomains = s.namecheapManualDomains.map(manualDomainToForm)
  form.openrouterBillingEnabled = s.openrouterBillingEnabled
  form.openrouterManagementKey = s.hasOpenrouterManagementKey ? SAVED_PASSWORD_MASK : ''
  if (form.namecheapManualDomains.length === 0) {
    addManualDomain()
  }
}

watch(() => data.value?.settings, (s) => {
  if (!s) return
  hydrate(s)
}, { immediate: true })

const hasVultrKey = computed(() =>
  !!data.value?.settings.hasVultrApiKey
  || (!isSavedPasswordMask(form.vultrApiKey) && form.vultrApiKey.trim().length >= 8),
)

function applySavedSettings(settings: BillingIntegrationsView) {
  if (data.value) {
    data.value = { settings }
  }
  hydrate(settings)
}

const PROVIDER_LIST_TIMEOUT_MS = 20_000

const vultrInstances = ref<VultrInstanceOption[]>([])
const vultrInstancesLoading = ref(false)
const vultrInstancesError = ref('')

async function loadVultrInstances() {
  if (!hasVultrKey.value) return
  vultrInstancesLoading.value = true
  vultrInstancesError.value = ''
  try {
    const res = await $fetch<{ instances: VultrInstanceOption[] }>('/api/admin/billing/vultr/instances', {
      timeout: PROVIDER_LIST_TIMEOUT_MS,
    })
    vultrInstances.value = res.instances
  }
  catch (e: unknown) {
    vultrInstancesError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load Vultr instances'
  }
  finally {
    vultrInstancesLoading.value = false
  }
}

watch(hasVultrKey, (ok) => {
  if (ok && data.value?.settings.hasVultrApiKey) void loadVultrInstances()
}, { immediate: true })

function toggleInstance(id: string, checked: boolean) {
  const set = new Set(form.vultrMonitoredInstanceIds)
  if (checked) set.add(id)
  else set.delete(id)
  form.vultrMonitoredInstanceIds = [...set]
}

function addManualDomain() {
  form.namecheapManualDomains.push({ name: '', renewalDate: '', renewalCost: '' })
}

function removeManualDomain(index: number) {
  form.namecheapManualDomains.splice(index, 1)
  if (form.namecheapManualDomains.length === 0) {
    addManualDomain()
  }
}

function fetchErrorMessage(e: unknown, fallback: string): string {
  const payload = (e as { data?: { message?: string, issues?: Array<{ path?: string, message?: string }> } })?.data
  const issue = payload?.issues?.find(row => row.message)
  if (issue) {
    const path = issue.path ? `${issue.path}: ` : ''
    return `${path}${issue.message}`
  }
  return payload?.message ?? fallback
}

function validateManualDomainsBeforeSave(): string | null {
  for (const row of form.namecheapManualDomains) {
    const name = row.name.trim()
    const renewalDate = row.renewalDate.trim()
    const renewalCost = row.renewalCost.trim()
    const hasAny = name || renewalDate || renewalCost
    if (!hasAny) continue
    if (name.length < 3) return 'Each domain needs a name (example.com).'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return `Expiry date is required for ${name}.`
    const cost = Number(renewalCost)
    if (!Number.isFinite(cost) || cost < 0) return `Renewal cost is required for ${name}.`
  }
  return null
}

const saveBusy = ref(false)
const testBusy = ref(false)
const message = ref('')
const error = ref('')

async function save() {
  saveBusy.value = true
  message.value = ''
  error.value = ''

  const manualValidationError = validateManualDomainsBeforeSave()
  if (manualValidationError) {
    error.value = manualValidationError
    saveBusy.value = false
    return
  }

  try {
    const manualDomains = formManualDomainsForSave()
    const body: Record<string, unknown> = {
      vultrEnabled: form.vultrEnabled,
      vultrMonitoredInstanceIds: form.vultrMonitoredInstanceIds,
      namecheapEnabled: manualDomains.length > 0,
      namecheapManualDomains: manualDomains,
      openrouterBillingEnabled: form.openrouterBillingEnabled,
    }

    const vultrKey = passwordForSave(form.vultrApiKey, !!data.value?.settings.hasVultrApiKey)
    if (vultrKey) body.vultrApiKey = vultrKey

    const managementKey = passwordForSave(
      form.openrouterManagementKey,
      !!data.value?.settings.hasOpenrouterManagementKey,
    )
    if (managementKey) body.openrouterManagementKey = managementKey

    const res = await $fetch<IntegrationsResponse>('/api/admin/billing/integrations', { method: 'PATCH', body })
    applySavedSettings(res.settings)
    message.value = 'Billing settings saved'
    emit('saved')
    void refresh()
    if (res.settings.hasVultrApiKey && res.settings.vultrEnabled) {
      void loadVultrInstances()
    }
  }
  catch (e: unknown) {
    error.value = fetchErrorMessage(e, 'Save failed')
  }
  finally {
    saveBusy.value = false
  }
}

async function testVultrConnection() {
  testBusy.value = true
  message.value = ''
  error.value = ''
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
    void loadVultrInstances()
  }
  catch (e: unknown) {
    error.value = fetchErrorMessage(e, 'Connection test failed')
  }
  finally {
    testBusy.value = false
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Infrastructure billing</h3>
      <p>
        Connect providers for the billing dashboard. Keys are encrypted in PostgreSQL and never returned to the browser.
      </p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="stack" @submit.prevent="save">
      <div class="card">
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
          <label class="fld">
            API key
            <input v-model="form.vultrApiKey" type="password" maxlength="512" autocomplete="off" placeholder="Vultr API token">
          </label>
          <div class="settings-actions">
            <button type="button" class="btn" :disabled="testBusy" @click="testVultrConnection">
              {{ testBusy ? 'Testing…' : 'Test connection' }}
            </button>
          </div>

          <template v-if="hasVultrKey && form.vultrEnabled">
            <hr class="section-divider">
            <div class="notif-label">Monitored servers</div>
            <button type="button" class="btn sm" :disabled="vultrInstancesLoading" @click="loadVultrInstances">
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
          </template>
        </div>
      </div>

      <div class="card">
        <div class="chead provider-card-head">
          <div>
            <h3>{{ labels.namecheap.name }}</h3>
            <span class="provider-category">{{ labels.namecheap.category }}</span>
          </div>
        </div>
        <div class="cbody settings-form">
          <p class="settings-help">Enter each domain manually. Saved domains appear on the Billing page.</p>
          <div v-if="form.namecheapManualDomains.length" class="manual-domain-list">
            <div v-for="(row, index) in form.namecheapManualDomains" :key="index" class="manual-domain-row">
              <label class="fld">
                Domain
                <input v-model="row.name" type="text" maxlength="253" placeholder="example.com">
              </label>
              <label class="fld">
                Expiry
                <input v-model="row.renewalDate" type="date">
              </label>
              <label class="fld">
                Cost (USD)
                <input v-model="row.renewalCost" type="number" min="0" step="0.01" placeholder="15.88">
              </label>
              <button type="button" class="btn sm danger" @click="removeManualDomain(index)">
                Remove
              </button>
            </div>
          </div>
          <button type="button" class="btn sm" @click="addManualDomain">
            + Add domain
          </button>
        </div>
      </div>

      <div class="card">
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
      </div>

      <p v-if="message" class="settings-ok">{{ message }}</p>
      <p v-if="error" class="settings-err">{{ error }}</p>

      <div class="settings-actions">
        <button type="submit" class="btn primary" :disabled="saveBusy">
          {{ saveBusy ? 'Saving…' : 'Save billing settings' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
@import './settings-panel.css';

.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.section-divider {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 4px 0;
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

.manual-domain-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.manual-domain-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: 10px;
  align-items: end;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

@media (max-width: 900px) {
  .manual-domain-row {
    grid-template-columns: 1fr;
  }
}

.btn.sm.danger {
  color: #b91c1c;
  border-color: #fecaca;
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
  color: #6366f1;
}
</style>
