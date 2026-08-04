<script setup lang="ts">
import type { BillingIntegrationsView, NamecheapManualDomain } from '#shared/validators/billing-integrations'
import { isSavedPasswordMask, passwordForSave, SAVED_PASSWORD_MASK } from '~/utils/settings-credentials'

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

interface NamecheapDomainOption {
  name: string
  expires: string
  autoRenew: boolean
  isPremium: boolean
  isExpired: boolean
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
  namecheapEnabled: false,
  namecheapApiUser: '',
  namecheapUsername: '',
  namecheapClientIp: '',
  namecheapApiKey: '',
  namecheapUseSandbox: false,
  namecheapMonitoredDomains: [] as string[],
  namecheapManualDomains: [] as ManualDomainFormRow[],
  openrouterBillingEnabled: true,
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
  form.namecheapEnabled = s.namecheapEnabled
  form.namecheapApiUser = s.namecheapApiUser ?? ''
  form.namecheapUsername = s.namecheapUsername ?? ''
  form.namecheapClientIp = s.namecheapClientIp ?? ''
  form.namecheapApiKey = s.hasNamecheapApiKey ? SAVED_PASSWORD_MASK : ''
  form.namecheapUseSandbox = s.namecheapUseSandbox
  form.namecheapMonitoredDomains = [...s.namecheapMonitoredDomains]
  form.namecheapManualDomains = s.namecheapManualDomains.map(manualDomainToForm)
  form.openrouterBillingEnabled = s.openrouterBillingEnabled
}

watch(() => data.value?.settings, (s) => {
  if (!s) return
  hydrate(s)
}, { immediate: true })

const hasVultrKey = computed(() => !!data.value?.settings.hasVultrApiKey || (!isSavedPasswordMask(form.vultrApiKey) && form.vultrApiKey.trim().length >= 8))
const hasNamecheapKey = computed(() =>
  !!data.value?.settings.hasNamecheapApiKey
  || (!isSavedPasswordMask(form.namecheapApiKey) && form.namecheapApiKey.trim().length >= 8),
)

const vultrInstances = ref<VultrInstanceOption[]>([])
const vultrInstancesLoading = ref(false)
const vultrInstancesError = ref('')

const namecheapDomains = ref<NamecheapDomainOption[]>([])
const namecheapDomainsLoading = ref(false)
const namecheapDomainsError = ref('')

async function loadVultrInstances() {
  if (!hasVultrKey.value) return
  vultrInstancesLoading.value = true
  vultrInstancesError.value = ''
  try {
    const res = await $fetch<{ instances: VultrInstanceOption[] }>('/api/admin/billing/vultr/instances')
    vultrInstances.value = res.instances
  }
  catch (e: unknown) {
    vultrInstancesError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load Vultr instances'
  }
  finally {
    vultrInstancesLoading.value = false
  }
}

async function loadNamecheapDomains() {
  if (!hasNamecheapKey.value) return
  namecheapDomainsLoading.value = true
  namecheapDomainsError.value = ''
  try {
    const res = await $fetch<{ domains: NamecheapDomainOption[] }>('/api/admin/billing/namecheap/domains')
    namecheapDomains.value = res.domains
  }
  catch (e: unknown) {
    namecheapDomainsError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not load Namecheap domains'
  }
  finally {
    namecheapDomainsLoading.value = false
  }
}

watch(hasVultrKey, (ok) => {
  if (ok && data.value?.settings.hasVultrApiKey) void loadVultrInstances()
}, { immediate: true })

watch(hasNamecheapKey, (ok) => {
  if (ok && data.value?.settings.hasNamecheapApiKey) void loadNamecheapDomains()
}, { immediate: true })

function toggleInstance(id: string, checked: boolean) {
  const set = new Set(form.vultrMonitoredInstanceIds)
  if (checked) set.add(id)
  else set.delete(id)
  form.vultrMonitoredInstanceIds = [...set]
}

function toggleDomain(name: string, checked: boolean) {
  const set = new Set(form.namecheapMonitoredDomains)
  if (checked) set.add(name)
  else set.delete(name)
  form.namecheapMonitoredDomains = [...set]
}

function addManualDomain() {
  form.namecheapManualDomains.push({ name: '', renewalDate: '', renewalCost: '' })
}

function removeManualDomain(index: number) {
  form.namecheapManualDomains.splice(index, 1)
}

const saveBusy = ref(false)
const testBusy = ref<'vultr' | 'namecheap' | null>(null)
const message = ref('')
const error = ref('')

async function save() {
  saveBusy.value = true
  message.value = ''
  error.value = ''
  try {
    const body: Record<string, unknown> = {
      vultrEnabled: form.vultrEnabled,
      vultrMonitoredInstanceIds: form.vultrMonitoredInstanceIds,
      namecheapEnabled: form.namecheapEnabled,
      namecheapApiUser: form.namecheapApiUser.trim() || undefined,
      namecheapUsername: form.namecheapUsername.trim() || undefined,
      namecheapClientIp: form.namecheapClientIp.trim() || undefined,
      namecheapUseSandbox: form.namecheapUseSandbox,
      namecheapMonitoredDomains: form.namecheapMonitoredDomains,
      namecheapManualDomains: formManualDomainsForSave(),
      openrouterBillingEnabled: form.openrouterBillingEnabled,
    }

    const vultrKey = passwordForSave(form.vultrApiKey, !!data.value?.settings.hasVultrApiKey)
    if (vultrKey !== undefined) body.vultrApiKey = vultrKey

    const namecheapKey = passwordForSave(form.namecheapApiKey, !!data.value?.settings.hasNamecheapApiKey)
    if (namecheapKey !== undefined) body.namecheapApiKey = namecheapKey

    await $fetch('/api/admin/billing/integrations', { method: 'PATCH', body })
    message.value = 'Billing integrations saved'
    await refresh()
    if (data.value?.settings) hydrate(data.value.settings)
    if (data.value?.settings.hasVultrApiKey) await loadVultrInstances()
    if (data.value?.settings.hasNamecheapApiKey) await loadNamecheapDomains()
    emit('saved')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    saveBusy.value = false
  }
}

async function testConnection(provider: 'vultr' | 'namecheap') {
  testBusy.value = provider
  message.value = ''
  error.value = ''
  try {
    const body: Record<string, unknown> = { provider }
    if (provider === 'vultr') {
      const key = passwordForSave(form.vultrApiKey, !!data.value?.settings.hasVultrApiKey)
      if (key) body.vultrApiKey = key
    }
    if (provider === 'namecheap') {
      body.namecheapApiUser = form.namecheapApiUser.trim() || undefined
      body.namecheapUsername = form.namecheapUsername.trim() || undefined
      body.namecheapClientIp = form.namecheapClientIp.trim() || undefined
      body.namecheapUseSandbox = form.namecheapUseSandbox
      const key = passwordForSave(form.namecheapApiKey, !!data.value?.settings.hasNamecheapApiKey)
      if (key) body.namecheapApiKey = key
    }
    const res = await $fetch<{ message: string }>('/api/admin/billing/test-connection', { method: 'POST', body })
    message.value = res.message
    if (provider === 'vultr') await loadVultrInstances()
    if (provider === 'namecheap') await loadNamecheapDomains()
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Connection test failed'
  }
  finally {
    testBusy.value = null
  }
}
</script>

<template>
  <div class="settings-panel">
    <header class="settings-panel-head">
      <h3>Infrastructure billing</h3>
      <p>
        Connect Vultr and Namecheap for the billing monitor. OpenRouter billing uses the API key from Control Panel → AI.
        Provider keys are encrypted in PostgreSQL and never returned to the browser.
        Admins and managers with billing access see usage on the Billing page.
      </p>
    </header>

    <div v-if="pending" class="card"><div class="cbody">Loading…</div></div>

    <form v-else class="stack" @submit.prevent="save">
      <div class="card">
        <div class="chead"><h3>Vultr</h3></div>
        <div class="cbody settings-form">
          <div class="tglrow">
            <div>
              <div class="notif-label">Enable Vultr monitoring</div>
              <div class="notif-desc">Account balance, month-to-date usage, and billing history.</div>
            </div>
            <span class="tgl">
              <input v-model="form.vultrEnabled" type="checkbox">
              <span class="tr" />
            </span>
          </div>
          <label class="fld">
            API key
            <input v-model="form.vultrApiKey" type="password" maxlength="512" autocomplete="off" placeholder="Bearer token from Vultr API">
          </label>
          <div class="settings-actions">
            <button type="button" class="btn" :disabled="testBusy === 'vultr'" @click="testConnection('vultr')">
              {{ testBusy === 'vultr' ? 'Testing…' : 'Test Vultr connection' }}
            </button>
          </div>

          <template v-if="hasVultrKey && form.vultrEnabled">
            <hr class="section-divider">
            <div class="notif-label">Monitored servers</div>
            <p class="settings-help">Select which Vultr instances appear on the Billing dashboard.</p>
            <button type="button" class="btn sm" :disabled="vultrInstancesLoading" @click="loadVultrInstances">
              {{ vultrInstancesLoading ? 'Loading…' : 'Refresh instance list' }}
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
                  <small>{{ inst.region }} · {{ inst.plan }} · {{ inst.status }}<template v-if="inst.mainIp"> · {{ inst.mainIp }}</template></small>
                </span>
              </label>
            </div>
            <p v-else-if="!vultrInstancesLoading && !vultrInstancesError" class="settings-help">No instances returned from Vultr.</p>
          </template>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>Namecheap</h3></div>
        <div class="cbody settings-form">
          <div class="tglrow">
            <div>
              <div class="notif-label">Enable Namecheap monitoring</div>
              <div class="notif-desc">Track domain renewals via manual entries or the Namecheap API (API access requires 20+ domains in your account).</div>
            </div>
            <span class="tgl">
              <input v-model="form.namecheapEnabled" type="checkbox">
              <span class="tr" />
            </span>
          </div>
          <div class="row2">
            <label class="fld">
              API user
              <input v-model="form.namecheapApiUser" type="text" maxlength="120" autocomplete="off">
            </label>
            <label class="fld">
              Username
              <input v-model="form.namecheapUsername" type="text" maxlength="120" autocomplete="off">
            </label>
          </div>
          <label class="fld">
            Whitelisted client IP
            <input v-model="form.namecheapClientIp" type="text" maxlength="45" placeholder="Your server public IP">
          </label>
          <label class="fld">
            API key
            <input v-model="form.namecheapApiKey" type="password" maxlength="512" autocomplete="off">
          </label>
          <label class="settings-check">
            <input v-model="form.namecheapUseSandbox" type="checkbox">
            <span>Use Namecheap sandbox API (testing only)</span>
          </label>
          <div class="settings-actions">
            <button type="button" class="btn" :disabled="testBusy === 'namecheap'" @click="testConnection('namecheap')">
              {{ testBusy === 'namecheap' ? 'Testing…' : 'Test Namecheap connection' }}
            </button>
          </div>

          <template v-if="form.namecheapEnabled">
            <hr class="section-divider">
            <div class="notif-label">Manual domains</div>
            <p class="settings-help">
              Enter domains manually until Namecheap approves API access. These appear on the Billing dashboard immediately after save.
            </p>
            <div v-if="form.namecheapManualDomains.length" class="manual-domain-list">
              <div v-for="(row, index) in form.namecheapManualDomains" :key="index" class="manual-domain-row">
                <label class="fld">
                  Domain
                  <input v-model="row.name" type="text" maxlength="253" placeholder="example.com">
                </label>
                <label class="fld">
                  Expiry date
                  <input v-model="row.renewalDate" type="date">
                </label>
                <label class="fld">
                  Renewal cost (USD)
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
          </template>

          <template v-if="hasNamecheapKey && form.namecheapEnabled">
            <hr class="section-divider">
            <div class="notif-label">Watched domains (API)</div>
            <p class="settings-help">When API access is approved, select domains to sync renewal dates and pricing automatically.</p>
            <button type="button" class="btn sm" :disabled="namecheapDomainsLoading" @click="loadNamecheapDomains">
              {{ namecheapDomainsLoading ? 'Loading…' : 'Refresh domain list' }}
            </button>
            <p v-if="namecheapDomainsError" class="settings-err">{{ namecheapDomainsError }}</p>
            <div v-if="namecheapDomains.length" class="picker-list">
              <label v-for="domain in namecheapDomains" :key="domain.name" class="settings-check">
                <input
                  type="checkbox"
                  :checked="form.namecheapMonitoredDomains.includes(domain.name)"
                  @change="toggleDomain(domain.name, ($event.target as HTMLInputElement).checked)"
                >
                <span>
                  <b>{{ domain.name }}</b>
                  <small>Expires {{ domain.expires }}<template v-if="domain.isPremium"> · premium</template><template v-if="domain.autoRenew"> · auto-renew</template></small>
                </span>
              </label>
            </div>
            <p v-else-if="!namecheapDomainsLoading && !namecheapDomainsError" class="settings-help">No domains returned from Namecheap.</p>
          </template>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>OpenRouter</h3></div>
        <div class="cbody settings-form">
          <div class="tglrow">
            <div>
              <div class="notif-label">Enable OpenRouter billing</div>
              <div class="notif-desc">
                Show account credits and usage on the Billing page using the OpenRouter API key saved in
                <NuxtLink to="/admin?tab=ai">Control Panel → AI</NuxtLink>.
              </div>
            </div>
            <span class="tgl">
              <input v-model="form.openrouterBillingEnabled" type="checkbox">
              <span class="tr" />
            </span>
          </div>
          <p v-if="data?.settings.hasAiOpenRouterKey" class="settings-help">OpenRouter API key is configured in AI settings.</p>
          <p v-else class="settings-err">No OpenRouter API key yet — add one in Control Panel → AI to enable billing data.</p>
        </div>
      </div>

      <p v-if="message" class="settings-ok">{{ message }}</p>
      <p v-if="error" class="settings-err">{{ error }}</p>

      <div class="settings-actions">
        <button type="submit" class="btn primary" :disabled="saveBusy">
          {{ saveBusy ? 'Saving…' : 'Save billing integrations' }}
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
</style>
