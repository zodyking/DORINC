<script setup lang="ts">
// Control Panel — workspace settings, system health, and configuration.
import ControlPanelBackupRestore from '~/components/admin/ControlPanelBackupRestore.vue'
import ControlPanelImportExport from '~/components/admin/ControlPanelImportExport.vue'
import ControlPanelTemplateDesigner from '~/components/admin/ControlPanelTemplateDesigner.vue'
import SettingsShell, { type SettingsSection } from '~/components/admin/settings/SettingsShell.vue'
import SettingsBusinessPanel from '~/components/admin/settings/SettingsBusinessPanel.vue'
import SettingsEmailPanel from '~/components/admin/settings/SettingsEmailPanel.vue'
import SettingsInvoicePanel from '~/components/admin/settings/SettingsInvoicePanel.vue'
import SettingsCatalogPanel from '~/components/admin/settings/SettingsCatalogPanel.vue'
import SettingsLineDetectionPanel from '~/components/admin/settings/SettingsLineDetectionPanel.vue'
import { BRAND_NAME } from '~/constants/brand'
import {
  aiFeatureLabel,
  aiHealthTone,
  aiStatusLabel,
  backupHealthTone,
  backupStatusLabel,
  databaseHealthTone,
  formatAiCost,
  formatCapUsage,
  formatDbLatency,
  pdfWorkerHealthTone,
  pdfWorkerStatusLabel,
  smtpHealthTone,
  smtpSummary,
  suspiciousAlertRuleLabel,
  suspiciousAlertSeverityClass,
  workerQueueHealthTone,
  workerQueueStatusLabel,
} from '~/utils/admin-panel-ui'

definePageMeta({ layout: 'staff' })

const auth = useAuthStore()

if (import.meta.client && auth.loaded && !auth.can('system.admin.all')) {
  navigateTo('/dashboard')
}

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
  status: string
  createdAt: string
}

const { data: suspiciousAlerts, refresh: refreshSuspiciousAlerts } = await useFetch<{ items: SuspiciousAlertItem[] }>(
  '/api/admin/security/suspicious-activity',
)

const dismissAlertBusy = ref<string | null>(null)

const route = useRoute()
const router = useRouter()

type ControlPanelTab = SettingsSection

const settingsNavGroups = [
  {
    label: 'General',
    items: [
      { id: 'overview' as const, label: 'Overview', icon: '📊' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { id: 'business' as const, label: 'Business', icon: '🏢' },
      { id: 'email' as const, label: 'Email (SMTP)', icon: '✉️' },
      { id: 'invoice' as const, label: 'Invoices', icon: '🧾' },
      { id: 'catalog' as const, label: 'Catalog detection', icon: '📦' },
      { id: 'line-detection' as const, label: 'Line detection', icon: '🔤' },
      { id: 'designer' as const, label: 'Template designer', icon: '🎨' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'import' as const, label: 'Import / Export', icon: '⇅' },
      { id: 'backup' as const, label: 'Backup & Restore', icon: '☁️' },
      { id: 'ai' as const, label: 'AI', icon: '✦' },
      { id: 'security' as const, label: 'Security', icon: '🔒' },
    ],
  },
]

const activeTab = ref<ControlPanelTab>('overview')

watch(() => route.query.tab, (tab) => {
  const valid = settingsNavGroups.flatMap(g => g.items).map(i => i.id)
  if (tab && valid.includes(tab as ControlPanelTab)) {
    activeTab.value = tab as ControlPanelTab
  }
}, { immediate: true })

function setControlPanelTab(tab: ControlPanelTab) {
  activeTab.value = tab
  router.replace({ query: { ...route.query, tab } })
}

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

const { data: status, refresh, error } = await useFetch<SystemStatus>('/api/admin/system/status')

const canManageAi = computed(() => auth.can('ai.admin.all'))
const { data: aiData, refresh: refreshAi } = await useFetch<{
  settings: AiSettingsView
  usage: AiUsageSummary
  spendCaps: AiSpendCaps
}>(
  '/api/admin/ai/settings',
  { immediate: canManageAi.value },
)

const { data: usageLogs, refresh: refreshUsageLogs } = await useFetch<{
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
    <div class="pagehead">
      <div>
        <h2>Settings</h2>
        <p>Business profile, email, invoices, detection rules, backups, and system health</p>
      </div>
      <div class="actions">
        <NuxtLink to="/setup" class="btn primary">Server Setup Wizard</NuxtLink>
      </div>
    </div>

    <div v-if="error" class="card" style="padding:24px; margin-bottom:16px;">
      <p>You do not have access to the control panel.</p>
      <NuxtLink to="/dashboard" class="btn">Back to dashboard</NuxtLink>
    </div>

    <SettingsShell
      v-else-if="status"
      :groups="settingsNavGroups"
      :active="activeTab"
      @navigate="setControlPanelTab"
    >
      <div v-show="activeTab === 'overview'">
      <div class="admin-banner" style="margin-bottom:16px;">
        <span class="ico">🔐</span>
        <div>
          <b>UI-managed configuration</b>
          <p>Database, SMTP, encryption, workers, backups, and AI credentials are stored encrypted in PostgreSQL and managed through this panel or the setup wizard.</p>
        </div>
      </div>
      <div class="health" style="margin-bottom:16px;">
        <div class="hcard" :class="databaseHealthTone(status.database)">
          <span class="ic">🗄</span>
          <div>
            <b>PostgreSQL</b>
            <small>{{ formatDbLatency(status.dbLatencyMs) }}</small>
          </div>
          <span class="st pill" :class="status.database === 'ok' ? 'ok' : 'over'">
            {{ status.database === 'ok' ? 'Connected' : 'Error' }}
          </span>
        </div>

        <div class="hcard" :class="smtpHealthTone(status.smtp.configured)">
          <span class="ic">✉</span>
          <div>
            <b>SMTP</b>
            <small>{{ smtpSummary(status.smtp.host, status.smtp.port, status.smtp.configured) }}</small>
          </div>
          <span class="st pill" :class="status.smtp.configured ? 'ok' : 'warn'">
            {{ status.smtp.configured ? 'Configured' : 'Action needed' }}
          </span>
        </div>

        <div class="hcard ok">
          <span class="ic">📦</span>
          <div>
            <b>App version</b>
            <small>{{ BRAND_NAME }} v{{ status.version }}</small>
          </div>
          <span class="st pill ok">Running</span>
        </div>

        <div class="hcard" :class="pdfWorkerHealthTone(status.pdfWorker.status)">
          <span class="ic">📄</span>
          <div>
            <b>PDF worker</b>
            <small>{{ status.pdfWorker.message }}</small>
          </div>
          <span
            class="st pill"
            :class="status.pdfWorker.status === 'running' || status.pdfWorker.status === 'idle' ? 'ok' : status.pdfWorker.status === 'backlog' ? 'warn' : 'over'"
          >
            {{ pdfWorkerStatusLabel(status.pdfWorker.status) }}
          </span>
        </div>

        <div class="hcard" :class="workerQueueHealthTone(status.workerQueue.status)">
          <span class="ic">⚙</span>
          <div>
            <b>Worker queue</b>
            <small>{{ status.workerQueue.message }}</small>
          </div>
          <span
            class="st pill"
            :class="status.workerQueue.status === 'healthy' || status.workerQueue.status === 'idle' ? 'ok' : status.workerQueue.status === 'backlog' ? 'warn' : 'over'"
          >
            {{ workerQueueStatusLabel(status.workerQueue.status) }}
          </span>
        </div>

        <div class="hcard" :class="backupHealthTone(status.backup.status)">
          <span class="ic">☁</span>
          <div>
            <b>Backup</b>
            <small>{{ status.backup.message }}</small>
          </div>
          <span class="st pill" :class="status.backup.status === 'healthy' ? 'ok' : status.backup.status === 'error' ? 'over' : 'warn'">
            {{ backupStatusLabel(status.backup.status) }}
          </span>
        </div>

        <div v-if="status.ai" class="hcard" :class="aiHealthTone(status.ai.status)">
          <span class="ic">✦</span>
          <div>
            <b>OpenRouter AI</b>
            <small>
              {{ status.ai.defaultModel ?? 'No model' }}
              · {{ status.ai.hasApiKey ? 'key set' : 'no key' }}
              · {{ formatAiCost(status.ai.monthlyCostUsd) }}
            </small>
          </div>
          <span class="st pill" :class="status.ai.status === 'active' ? 'ok' : status.ai.status === 'error' ? 'over' : 'warn'">
            {{ aiStatusLabel(status.ai.status) }}
          </span>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="chead"><h3>Administration</h3></div>
        <div class="cbody cp-quicklinks">
          <NuxtLink to="/users" class="btn">Users &amp; Moderation</NuxtLink>
          <NuxtLink to="/deletion-requests" class="btn">Deletion Requests</NuxtLink>
          <NuxtLink to="/system-logs" class="btn">System Logs</NuxtLink>
        </div>
      </div>
      </div>

      <SettingsBusinessPanel v-if="activeTab === 'business'" @saved="refresh()" />
      <SettingsEmailPanel v-if="activeTab === 'email'" @saved="refresh()" />
      <SettingsInvoicePanel v-if="activeTab === 'invoice'" @saved="refresh()" />
      <SettingsCatalogPanel v-if="activeTab === 'catalog'" />
      <SettingsLineDetectionPanel v-if="activeTab === 'line-detection'" />

      <div v-if="activeTab === 'designer'">
        <ControlPanelTemplateDesigner />
      </div>

      <div v-if="activeTab === 'import'">
        <ControlPanelImportExport />
      </div>

      <div v-show="activeTab === 'ai'" class="stack">
          <div v-if="canManageAi && aiData" class="card">
            <div class="chead">
              <h3>AI settings</h3>
              <div class="right"><span class="pill indigo">Human approval required</span></div>
            </div>
            <div class="cbody">
              <label class="fld">
                Provider
                <select disabled><option>OpenRouter</option></select>
              </label>
              <label class="fld">
                Default model
                <input v-model="aiForm.defaultModel" type="text" placeholder="anthropic/claude-3.5-sonnet">
              </label>
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

      <div v-if="activeTab === 'backup'">
        <ControlPanelBackupRestore
          :backup-status="status.backup"
          @refreshed="refresh()"
        />
      </div>

      <div v-show="activeTab === 'security'" class="stack">
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
                    <th>Summary</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="alert in suspiciousAlerts.items" :key="alert.id">
                    <td><span class="mono" style="font-size:12px">{{ formatBackupWhen(alert.createdAt) }}</span></td>
                    <td>{{ suspiciousAlertRuleLabel(alert.ruleKey) }}</td>
                    <td><span class="pill" :class="suspiciousAlertSeverityClass(alert.severity)">{{ alert.severity }}</span></td>
                    <td>{{ alert.title }}</td>
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
    </SettingsShell>

  </section>
</template>
