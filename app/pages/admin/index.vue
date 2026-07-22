<script setup lang="ts">
// Control Panel — workspace settings, system health, and configuration.
import ControlPanelAccessGate from '~/components/admin/ControlPanelAccessGate.vue'
import ControlPanelBackupRestore from '~/components/admin/ControlPanelBackupRestore.vue'
import ControlPanelDatabaseChart from '~/components/admin/ControlPanelDatabaseChart.vue'
import ControlPanelImportExport from '~/components/admin/ControlPanelImportExport.vue'
import ControlPanelSection from '~/components/admin/ControlPanelSection.vue'
import ControlPanelSystemMonitor from '~/components/admin/ControlPanelSystemMonitor.vue'
import OpenRouterModelSelector from '~/components/admin/OpenRouterModelSelector.vue'
import SettingsBusinessPanel from '~/components/admin/settings/SettingsBusinessPanel.vue'
import SettingsEmailPanel from '~/components/admin/settings/SettingsEmailPanel.vue'
import SettingsImapPanel from '~/components/admin/settings/SettingsImapPanel.vue'
import SettingsNotificationsPanel from '~/components/admin/settings/SettingsNotificationsPanel.vue'
import SettingsInvoicePanel from '~/components/admin/settings/SettingsInvoicePanel.vue'
import SettingsCatalogPanel from '~/components/admin/settings/SettingsCatalogPanel.vue'
import SettingsLineDetectionPanel from '~/components/admin/settings/SettingsLineDetectionPanel.vue'
import { BRAND_NAME } from '~/constants/brand'
import {
  aiFeatureLabel,
  aiHealthTone,
  backupHealthTone,
  formatCapUsage,
  securitySectionTone,
  smtpHealthTone,
  suspiciousAlertRuleLabel,
  suspiciousAlertSeverityClass,
  formatSuspiciousAlertUser,
  formatSuspiciousAlertIps,
  workerQueueStatusLabel,
} from '~/utils/admin-panel-ui'

definePageMeta({ layout: 'staff', permission: 'system.admin.all' })

const auth = useAuthStore()

interface SystemStatus {
  database: 'ok' | 'error'
  dbLatencyMs: number | null
  version: string
  smtp: {
    configured: boolean
    host: string | null
    port: number
    from: string | null
  }
  backup: {
    status: 'not_configured' | 'healthy' | 'error'
    message: string
    lastRunAt: string | null
    lastFilename: string | null
    scheduleEnabled: boolean
    scheduleLabel: string
    driveConnected: boolean
    driveAccountEmail: string | null
  }
  ai: {
    status: 'not_configured' | 'disabled' | 'active' | 'error'
    message: string
    defaultModel: string | null
    hasApiKey: boolean
    enabled: boolean
    monthlyCostUsd: number
  }
  pdfWorker: {
    status: 'running' | 'idle' | 'backlog' | 'error' | 'unknown'
    message: string
    queued: number
    processing: number
    failed: number
    lastSuccessAt: string | null
  }
  workerQueue: {
    status: 'healthy' | 'idle' | 'backlog' | 'error'
    message: string
    queued: number
    processing: number
    failed: number
    byType: Record<string, { queued: number, processing: number, failed: number }>
    lastActivityAt: string | null
  }
}

interface AiSettingsView {
  id: string
  provider: 'openrouter'
  enabled: boolean
  hasApiKey: boolean
  defaultModel: string
  serviceLogExtractionModel: string | null
  invoiceDescriptionModel: string | null
  platformHelpModel: string | null
  serviceLogExtractionEnabled: boolean
  invoiceDescriptionEnabled: boolean
  platformHelpEnabled: boolean
  dailySpendCapUsd: string | null
  monthlySpendCapUsd: string | null
  updatedAt: string
}

interface AiUsageSummary {
  monthStart: string
  totalRuns: number
  byFeature: Record<string, number>
  approvedSuggestions: number
  estimatedCostUsd: number
  dailyCostUsd: number
}

interface AiSpendCaps {
  dailyUsd: number
  monthlyUsd: number
  dailyCapUsd: number | null
  monthlyCapUsd: number | null
  dailyExceeded: boolean
  monthlyExceeded: boolean
  anyExceeded: boolean
}

interface AiUsageLogItem {
  id: string
  featureType: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  createdAt: string
}

interface SuspiciousAlertItem {
  id: string
  ruleKey: string
  severity: string
  title: string
  description: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  ipAddress: string | null
  ipAddresses: string[]
  status: string
  createdAt: string
}

const { data: suspiciousAlerts, refresh: refreshSuspiciousAlerts } = useClientFetch<{ items: SuspiciousAlertItem[] }>(
  '/api/admin/security/suspicious-activity',
)

const dismissAlertBusy = ref<string | null>(null)

type ControlPanelSectionId
  = | 'business'
    | 'email'
    | 'chat'
    | 'notifications'
    | 'invoice'
    | 'catalog'
    | 'line-detection'
    | 'import'
    | 'backup'
    | 'ai'
    | 'security'

const openSections = reactive<Record<ControlPanelSectionId, boolean>>({
  business: false,
  email: false,
  chat: false,
  notifications: false,
  invoice: false,
  catalog: false,
  'line-detection': false,
  import: false,
  backup: false,
  ai: false,
  security: false,
})

const route = useRoute()
const router = useRouter()

function setSectionOpen(id: ControlPanelSectionId, open: boolean) {
  openSections[id] = open
  if (open) {
    router.replace({ query: { ...route.query, tab: id } })
  }
  else if (route.query.tab === id) {
    const { tab, ...rest } = route.query
    router.replace({ query: rest })
  }
}

watch(() => route.query.tab, (tab) => {
  const valid: ControlPanelSectionId[] = [
    'business', 'email', 'chat', 'notifications', 'invoice', 'catalog', 'line-detection',
    'import', 'backup', 'ai', 'security',
  ]
  if (typeof tab === 'string' && valid.includes(tab as ControlPanelSectionId)) {
    openSections[tab as ControlPanelSectionId] = true
    nextTick(() => {
      document.getElementById(`cp-section-${tab}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}, { immediate: true })

function formatBackupWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

async function dismissSuspiciousAlert(alertId: string) {
  dismissAlertBusy.value = alertId
  try {
    await $fetch(`/api/admin/security/suspicious-activity/${alertId}/dismiss`, { method: 'POST' })
    await refreshSuspiciousAlerts()
  }
  finally {
    dismissAlertBusy.value = null
  }
}

const { data: status, refresh, error } = useClientFetch<SystemStatus>('/api/admin/system/status')

const monitorStatus = computed(() => {
  if (!status.value) return null
  return {
    database: status.value.database,
    dbLatencyMs: status.value.dbLatencyMs,
    version: status.value.version,
    brandName: BRAND_NAME,
    smtp: status.value.smtp,
    backup: {
      status: status.value.backup.status,
      message: status.value.backup.message,
    },
    ai: status.value.ai ?? null,
    pdfWorker: status.value.pdfWorker,
    workerQueue: status.value.workerQueue,
  }
})

const securityTone = computed(() => {
  if (!status.value) return undefined
  return securitySectionTone(
    status.value.workerQueue.status,
    suspiciousAlerts.value?.items?.length ?? 0,
  )
})

const canManageAi = computed(() => auth.can('ai.admin.all'))
const { data: aiData, refresh: refreshAi } = useClientFetch<{
  settings: AiSettingsView
  usage: AiUsageSummary
  spendCaps: AiSpendCaps
}>(
  '/api/admin/ai/settings',
  { immediate: canManageAi.value },
)

const { data: usageLogs, refresh: refreshUsageLogs } = useClientFetch<{
  items: AiUsageLogItem[]
  total: number
}>('/api/admin/ai/usage', { immediate: canManageAi.value })

const aiForm = reactive({
  enabled: false,
  defaultModel: 'anthropic/claude-3.5-sonnet',
  apiKey: '',
  serviceLogExtractionEnabled: true,
  invoiceDescriptionEnabled: true,
  platformHelpEnabled: true,
  dailySpendCapUsd: '' as string,
  monthlySpendCapUsd: '' as string,
})

watch(() => aiData.value?.settings, (s) => {
  if (!s) return
  aiForm.enabled = s.enabled
  aiForm.defaultModel = s.defaultModel
  aiForm.serviceLogExtractionEnabled = s.serviceLogExtractionEnabled
  aiForm.invoiceDescriptionEnabled = s.invoiceDescriptionEnabled
  aiForm.platformHelpEnabled = s.platformHelpEnabled
  aiForm.dailySpendCapUsd = s.dailySpendCapUsd ?? ''
  aiForm.monthlySpendCapUsd = s.monthlySpendCapUsd ?? ''
  aiForm.apiKey = ''
}, { immediate: true })

const aiSaveBusy = ref(false)
const aiTestBusy = ref(false)
const aiMessage = ref('')
const aiError = ref('')

async function saveAiSettings() {
  aiSaveBusy.value = true
  aiMessage.value = ''
  aiError.value = ''
  try {
    const body: Record<string, unknown> = {
      enabled: aiForm.enabled,
      defaultModel: aiForm.defaultModel.trim(),
      serviceLogExtractionEnabled: aiForm.serviceLogExtractionEnabled,
      invoiceDescriptionEnabled: aiForm.invoiceDescriptionEnabled,
      platformHelpEnabled: aiForm.platformHelpEnabled,
      dailySpendCapUsd: aiForm.dailySpendCapUsd.trim()
        ? Number(aiForm.dailySpendCapUsd)
        : null,
      monthlySpendCapUsd: aiForm.monthlySpendCapUsd.trim()
        ? Number(aiForm.monthlySpendCapUsd)
        : null,
    }
    if (aiForm.apiKey.trim()) body.apiKey = aiForm.apiKey.trim()

    await $fetch('/api/admin/ai/settings', { method: 'PATCH', body })
    aiForm.apiKey = ''
    aiMessage.value = 'AI settings saved'
    await Promise.all([refresh(), refreshAi(), refreshUsageLogs()])
  }
  catch (e: unknown) {
    aiError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    aiSaveBusy.value = false
  }
}

async function testAiConnection() {
  aiTestBusy.value = true
  aiMessage.value = ''
  aiError.value = ''
  try {
    const body = aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : undefined
    const res = await $fetch<{ message: string }>('/api/admin/ai/test-connection', {
      method: 'POST',
      body,
    })
    aiMessage.value = res.message
  }
  catch (e: unknown) {
    aiError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Connection test failed'
  }
  finally {
    aiTestBusy.value = false
  }
}

</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="System monitoring, workspace configuration, and administration">
      <template #title>Control Panel</template>
      <template #actions>
        <NuxtLink to="/setup" class="btn primary">Server Setup Wizard</NuxtLink>
      </template>
    </StaffPageHead>

    <div v-if="error" class="card" style="padding:24px; margin-bottom:16px;">
      <p>You do not have access to the control panel.</p>
      <NuxtLink to="/dashboard" class="btn">Back to dashboard</NuxtLink>
    </div>

    <template v-else-if="status">
      <div class="admin-overview">
        <ControlPanelDatabaseChart hero style="margin-bottom:16px;" />

        <ControlPanelSystemMonitor
          v-if="monitorStatus"
          :status="monitorStatus"
          style="margin-bottom:20px;"
        />
      </div>

      <div class="cp-sections">
        <p class="cp-sections-label">Configuration</p>
        <p class="cp-sections-sublabel">Workspace</p>

        <ControlPanelSection
          id="business"
          title="Business"
          icon="🏢"
          subtitle="Shop name, contact, and address"
          :open="openSections.business"
          @update:open="setSectionOpen('business', $event)"
        >
          <SettingsBusinessPanel @saved="refresh()" />
        </ControlPanelSection>

        <ControlPanelSection
          id="email"
          title="Email"
          icon="✉️"
          subtitle="Outbound SMTP, inbound IMAP, and test delivery"
          :status-tone="smtpHealthTone(status.smtp.configured)"
          :open="openSections.email"
          @update:open="setSectionOpen('email', $event)"
        >
          <SettingsEmailPanel @saved="refresh()" />
          <SettingsImapPanel @saved="refresh()" />
        </ControlPanelSection>

        <ControlPanelSection
          id="chat"
          title="Chat"
          icon="💬"
          subtitle="Team chat and direct messaging"
          :open="openSections.chat"
          @update:open="setSectionOpen('chat', $event)"
        >
          <SettingsChatPanel @saved="refresh()" />
        </ControlPanelSection>

        <ControlPanelSection
          id="notifications"
          title="Notifications"
          icon="🔔"
          subtitle="Toggle app-wide email alerts"
          :open="openSections.notifications"
          @update:open="setSectionOpen('notifications', $event)"
        >
          <SettingsNotificationsPanel @saved="refresh()" />
        </ControlPanelSection>

        <ControlPanelSection
          id="invoice"
          title="Invoices"
          icon="🧾"
          subtitle="Payment terms and approval thresholds"
          :open="openSections.invoice"
          @update:open="setSectionOpen('invoice', $event)"
        >
          <SettingsInvoicePanel @saved="refresh()" />
        </ControlPanelSection>

        <ControlPanelSection
          id="catalog"
          title="Catalog detection"
          icon="📦"
          subtitle="Category keyword rules"
          :open="openSections.catalog"
          @update:open="setSectionOpen('catalog', $event)"
        >
          <SettingsCatalogPanel />
        </ControlPanelSection>

        <ControlPanelSection
          id="line-detection"
          title="Line detection"
          icon="🔤"
          subtitle="Part, labor, and fee verb lists"
          :open="openSections['line-detection']"
          @update:open="setSectionOpen('line-detection', $event)"
        >
          <SettingsLineDetectionPanel />
        </ControlPanelSection>

        <p class="cp-sections-sublabel">System</p>

        <ControlPanelSection
          id="import"
          title="Import / Export"
          icon="⇅"
          subtitle="Bulk data exchange"
          :open="openSections.import"
          @update:open="setSectionOpen('import', $event)"
        >
          <ControlPanelImportExport />
        </ControlPanelSection>

        <ControlPanelSection
          id="backup"
          title="Backup & Restore"
          icon="☁️"
          subtitle="Encrypted archives and Google Drive"
          :status-tone="backupHealthTone(status.backup.status)"
          :open="openSections.backup"
          @update:open="setSectionOpen('backup', $event)"
        >
          <ControlPanelBackupRestore
            :backup-status="status.backup"
            @refreshed="refresh()"
          />
        </ControlPanelSection>

        <ControlPanelSection
          id="ai"
          title="AI"
          icon="✦"
          subtitle="OpenRouter models, caps, and usage"
          :status-tone="status.ai ? aiHealthTone(status.ai.status) : undefined"
          :open="openSections.ai"
          @update:open="setSectionOpen('ai', $event)"
        >
          <div class="stack">
            <div v-if="canManageAi && aiData" class="card">
              <div class="chead">
                <h3>AI settings</h3>
                <div class="right"><span class="pill indigo">Human approval required</span></div>
              </div>
              <div class="cbody">
                <p class="help" style="margin:0 0 14px;">
                  OpenRouter is the sole AI provider. Models and pricing are loaded live from OpenRouter.
                </p>
                <OpenRouterModelSelector
                  v-model="aiForm.defaultModel"
                  :api-key="aiForm.apiKey"
                />
                <label class="fld secret-fld">
                  OpenRouter API key
                  <input
                    v-model="aiForm.apiKey"
                    type="password"
                    :placeholder="aiData.settings.hasApiKey ? '•••••••• (leave blank to keep)' : 'sk-or-…'"
                    autocomplete="off"
                  >
                </label>
                <div class="tglrow">
                  AI enabled
                  <span class="tgl"><input v-model="aiForm.enabled" type="checkbox"><span class="tr" /></span>
                </div>
                <div class="tglrow">
                  Service log extraction
                  <span class="tgl"><input v-model="aiForm.serviceLogExtractionEnabled" type="checkbox"><span class="tr" /></span>
                </div>
                <div class="tglrow">
                  Invoice description writer
                  <span class="tgl"><input v-model="aiForm.invoiceDescriptionEnabled" type="checkbox"><span class="tr" /></span>
                </div>
                <div class="tglrow">
                  Platform help assistant
                  <span class="tgl"><input v-model="aiForm.platformHelpEnabled" type="checkbox"><span class="tr" /></span>
                </div>
                <label class="fld">
                  Daily spend cap (USD)
                  <input v-model="aiForm.dailySpendCapUsd" type="number" min="0" step="0.01" placeholder="No cap">
                </label>
                <label class="fld">
                  Monthly spend cap (USD)
                  <input v-model="aiForm.monthlySpendCapUsd" type="number" min="0" step="0.01" placeholder="No cap">
                </label>
                <p v-if="aiMessage" style="color:#059669; font-size:13px; margin:12px 0 0;">{{ aiMessage }}</p>
                <p v-if="aiError" style="color:#dc2626; font-size:13px; margin:12px 0 0;">{{ aiError }}</p>
                <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                  <button class="btn primary" :disabled="aiSaveBusy" @click="saveAiSettings">
                    {{ aiSaveBusy ? 'Saving…' : 'Save AI settings' }}
                  </button>
                  <button class="btn" :disabled="aiTestBusy" @click="testAiConnection">
                    {{ aiTestBusy ? 'Testing…' : 'Test connection' }}
                  </button>
                </div>
                <span class="help" style="display:block; margin-top:8px;">
                  API keys are encrypted in PostgreSQL and never returned to the browser.
                </span>
              </div>
            </div>

            <div v-if="canManageAi && aiData" class="card">
              <div class="chead"><h3>Usage This Month</h3></div>
              <dl class="kv">
                <dt>{{ aiFeatureLabel('service_log_extraction') }}</dt>
                <dd>{{ aiData.usage.byFeature.service_log_extraction ?? 0 }} runs</dd>
                <dt>{{ aiFeatureLabel('invoice_description') }}</dt>
                <dd>{{ aiData.usage.byFeature.invoice_description ?? 0 }} drafts</dd>
                <dt>{{ aiFeatureLabel('platform_help') }}</dt>
                <dd>{{ aiData.usage.byFeature.platform_help ?? 0 }} queries</dd>
                <dt>Approved</dt>
                <dd>{{ aiData.usage.approvedSuggestions }}</dd>
                <dt>Est. cost (month)</dt>
                <dd>${{ aiData.usage.estimatedCostUsd.toFixed(2) }}</dd>
                <dt>Daily spend</dt>
                <dd>{{ formatCapUsage(aiData.spendCaps.dailyUsd, aiData.spendCaps.dailyCapUsd) }}</dd>
                <dt>Monthly spend</dt>
                <dd>{{ formatCapUsage(aiData.spendCaps.monthlyUsd, aiData.spendCaps.monthlyCapUsd) }}</dd>
              </dl>
            </div>

            <div v-if="canManageAi && usageLogs?.items?.length" class="card">
              <div class="chead">
                <h3>AI Usage Log</h3>
                <div class="right"><span class="pill indigo">{{ usageLogs.total }} entries</span></div>
              </div>
              <div class="tscroll">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Feature</th>
                      <th>Model</th>
                      <th class="num">Tokens</th>
                      <th class="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in usageLogs.items" :key="row.id">
                      <td><span class="mono" style="font-size:12px">{{ new Date(row.createdAt).toLocaleString() }}</span></td>
                      <td>{{ aiFeatureLabel(row.featureType) }}</td>
                      <td><span class="mono" style="font-size:11px">{{ row.model }}</span></td>
                      <td class="num">{{ row.totalTokens }}</td>
                      <td class="num">${{ row.estimatedCostUsd.toFixed(4) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ControlPanelSection>

        <ControlPanelSection
          id="security"
          title="Security"
          icon="🔒"
          subtitle="Alerts and worker queue detail"
          :status-tone="securityTone"
          :open="openSections.security"
          @update:open="setSectionOpen('security', $event)"
        >
          <div class="stack">
            <ControlPanelAccessGate />

            <div class="card">
              <div class="chead">
                <h3>Suspicious Activity</h3>
                <div class="right">
                  <span class="pill" :class="(suspiciousAlerts?.items?.length ?? 0) > 0 ? 'warn' : 'ok'">
                    {{ suspiciousAlerts?.items?.length ?? 0 }} open
                  </span>
                </div>
              </div>
              <div v-if="suspiciousAlerts?.items?.length" class="tscroll">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Rule</th>
                      <th>Severity</th>
                      <th>User</th>
                      <th>IP address(es)</th>
                      <th>Summary</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="alert in suspiciousAlerts.items" :key="alert.id">
                      <td><span class="mono" style="font-size:12px">{{ formatBackupWhen(alert.createdAt) }}</span></td>
                      <td>{{ suspiciousAlertRuleLabel(alert.ruleKey) }}</td>
                      <td><span class="pill" :class="suspiciousAlertSeverityClass(alert.severity)">{{ alert.severity }}</span></td>
                      <td>{{ formatSuspiciousAlertUser(alert) }}</td>
                      <td><span class="mono" style="font-size:12px">{{ formatSuspiciousAlertIps(alert) }}</span></td>
                      <td>
                        <div>{{ alert.title }}</div>
                        <div v-if="alert.description" style="font-size:12px; color:#64748b; margin-top:2px;">
                          {{ alert.description }}
                        </div>
                      </td>
                      <td>
                        <button
                          class="btn sm"
                          :disabled="dismissAlertBusy === alert.id"
                          @click="dismissSuspiciousAlert(alert.id)"
                        >
                          {{ dismissAlertBusy === alert.id ? '…' : 'Dismiss' }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="cbody" style="font-size:13px; color:#64748b; margin:0;">
                No open alerts — basic rules monitor failed login bursts, off-hours admin actions, high-risk bursts, and restore attempts.
              </p>
            </div>

            <div class="card">
              <div class="chead"><h3>Worker Queue</h3></div>
              <dl class="kv">
                <dt>Status</dt>
                <dd>{{ workerQueueStatusLabel(status.workerQueue.status) }}</dd>
                <dt>Queued</dt>
                <dd>{{ status.workerQueue.queued }}</dd>
                <dt>Processing</dt>
                <dd>{{ status.workerQueue.processing }}</dd>
                <dt>Failed</dt>
                <dd>{{ status.workerQueue.failed }}</dd>
                <dt>Last activity</dt>
                <dd>{{ formatBackupWhen(status.workerQueue.lastActivityAt) }}</dd>
              </dl>
              <div v-if="Object.keys(status.workerQueue.byType).length" class="tscroll" style="margin-top:0;">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Job type</th>
                      <th class="num">Queued</th>
                      <th class="num">Active</th>
                      <th class="num">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(counts, jobType) in status.workerQueue.byType" :key="jobType">
                      <td>{{ aiFeatureLabel(String(jobType)) }}</td>
                      <td class="num">{{ counts.queued }}</td>
                      <td class="num">{{ counts.processing }}</td>
                      <td class="num">{{ counts.failed }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ControlPanelSection>
      </div>
    </template>

  </section>
</template>
