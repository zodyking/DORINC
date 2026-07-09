<script setup lang="ts">
// Control Panel — system health, import/export, backups, and configuration.
import ControlPanelImportExport from '~/components/admin/ControlPanelImportExport.vue'
import ControlPanelTemplateDesigner from '~/components/admin/ControlPanelTemplateDesigner.vue'
import { BRAND_NAME } from '~/constants/brand'
import {
  aiFeatureLabel,
  aiHealthTone,
  aiStatusLabel,
  backupDestinationLabel,
  backupHealthTone,
  backupRunStatusClass,
  backupStatusLabel,
  databaseHealthTone,
  driveConnectionLabel,
  formatAiCost,
  formatBackupSize,
  formatCapUsage,
  formatDbLatency,
  formatScheduleDisplay,
  pdfWorkerHealthTone,
  pdfWorkerStatusLabel,
  recoveryTestStatusClass,
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

interface BackupRunItem {
  id: string
  filename: string
  status: string
  trigger: string
  encryptedBytes: number
  sha256Checksum: string
  driveFileId: string | null
  driveUploadedAt: string | null
  finishedAt: string | null
  createdAt: string
  errorMessage: string | null
}

interface RecoveryTestItem {
  id: string
  backupRunId: string
  status: string
  valid: boolean | null
  tocEntries: number | null
  errorMessage: string | null
  finishedAt: string | null
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

interface BackupSettingsView {
  id: string
  enabled: boolean
  scheduleCron: string | null
  retentionDaily: number
  retentionWeekly: number
  retentionMonthly: number
  storageMode: string
  notifyEmail: string | null
  updatedAt: string
}

interface BackupIntegrationView {
  provider: 'google_drive'
  connected: boolean
  configured: boolean
  accountEmail: string | null
  folderId: string | null
  lastTestedAt: string | null
  lastError: string | null
}

const backupBusy = ref(false)
const backupMessage = ref('')
const backupError = ref('')
const driveTestBusy = ref(false)
const driveDisconnectBusy = ref(false)

const canManageBackups = computed(() => auth.can('backups.manage.all'))

const { data: backupData, refresh: refreshBackupData } = await useFetch<{
  integration: BackupIntegrationView
  settings: BackupSettingsView
}>('/api/admin/backups/integration', { immediate: canManageBackups.value })

const backupForm = reactive({
  enabled: false,
  notifyEmail: '' as string,
})

watch(() => backupData.value?.settings, (s) => {
  if (!s) return
  backupForm.enabled = s.enabled
  backupForm.notifyEmail = s.notifyEmail ?? ''
}, { immediate: true })

const { data: backupRuns, refresh: refreshRuns } = await useFetch<{ items: BackupRunItem[] }>(
  '/api/admin/backups/runs',
  { immediate: canManageBackups.value },
)

const { data: recoveryTests, refresh: refreshRecoveryTests } = await useFetch<{ items: RecoveryTestItem[] }>(
  '/api/admin/backups/recovery-tests',
)

const { data: suspiciousAlerts, refresh: refreshSuspiciousAlerts } = await useFetch<{ items: SuspiciousAlertItem[] }>(
  '/api/admin/security/suspicious-activity',
)

const { data: stepUpStatus, refresh: refreshStepUp } = await useFetch<{ verified: boolean, expiresAt: string | null }>(
  '/api/auth/step-up/status',
)

const restoreModalOpen = ref(false)
const restoreTarget = ref<BackupRunItem | null>(null)
const restorePassword = ref('')
const restoreReason = ref('')
const restoreBusy = ref(false)
const recoveryTestBusy = ref<string | null>(null)
const dismissAlertBusy = ref<string | null>(null)

const route = useRoute()
const router = useRouter()

type ControlPanelTab = 'overview' | 'designer' | 'import' | 'backup' | 'email-ai' | 'security'
const controlPanelTabs: { id: ControlPanelTab, label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'designer', label: 'Template Designer' },
  { id: 'import', label: 'Import / Export' },
  { id: 'backup', label: 'Backup & Restore' },
  { id: 'email-ai', label: 'Email & AI' },
  { id: 'security', label: 'Security' },
]
const activeTab = ref<ControlPanelTab>('overview')

watch(() => route.query.tab, (tab) => {
  if (tab === 'overview' || tab === 'designer' || tab === 'import' || tab === 'backup' || tab === 'email-ai' || tab === 'security') {
    activeTab.value = tab
  }
}, { immediate: true })

function setControlPanelTab(tab: ControlPanelTab) {
  activeTab.value = tab
  const query = { ...route.query, tab }
  router.replace({ query })
}

watch(() => route.query.backup_oauth, (val) => {
  if (!val || !import.meta.client) return
  if (val === 'connected') backupMessage.value = 'Google Drive connected successfully'
  else if (val === 'denied') backupError.value = 'Google Drive authorization was denied'
  else if (val === 'error') {
    backupError.value = typeof route.query.reason === 'string'
      ? decodeURIComponent(route.query.reason)
      : 'Google Drive connection failed'
  }
  refreshBackupData()
  refresh()
}, { immediate: true })

async function runBackupNow() {
  backupBusy.value = true
  backupMessage.value = ''
  backupError.value = ''
  try {
    const res = await $fetch<{ filename: string, sha256Checksum: string }>('/api/admin/backups/run', {
      method: 'POST',
    })
    backupMessage.value = `Backup completed — ${res.filename}`
    await Promise.all([refresh(), refreshRuns(), refreshBackupData()])
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Backup failed'
    await refresh()
  }
  finally {
    backupBusy.value = false
  }
}

async function connectGoogleDrive() {
  backupMessage.value = ''
  backupError.value = ''
  try {
    const res = await $fetch<{ url: string }>('/api/admin/backups/google/auth-url')
    window.location.href = res.url
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not start Google OAuth'
  }
}

async function disconnectGoogleDrive() {
  driveDisconnectBusy.value = true
  backupMessage.value = ''
  backupError.value = ''
  try {
    await $fetch('/api/admin/backups/google/disconnect', { method: 'POST' })
    backupMessage.value = 'Google Drive disconnected'
    await Promise.all([refresh(), refreshBackupData()])
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Disconnect failed'
  }
  finally {
    driveDisconnectBusy.value = false
  }
}

async function testDriveConnection() {
  driveTestBusy.value = true
  backupMessage.value = ''
  backupError.value = ''
  try {
    const res = await $fetch<{ message: string }>('/api/admin/backups/test-connection', { method: 'POST' })
    backupMessage.value = res.message
    await Promise.all([refresh(), refreshBackupData()])
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Connection test failed'
  }
  finally {
    driveTestBusy.value = false
  }
}

const backupSaveBusy = ref(false)

async function saveBackupSettings() {
  backupSaveBusy.value = true
  backupMessage.value = ''
  backupError.value = ''
  try {
    await $fetch('/api/admin/backups/settings', {
      method: 'PATCH',
      body: {
        enabled: backupForm.enabled,
        notifyEmail: backupForm.notifyEmail.trim() || null,
      },
    })
    backupMessage.value = 'Backup settings saved'
    await Promise.all([refresh(), refreshBackupData()])
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    backupSaveBusy.value = false
  }
}

function openRestoreModal(run: BackupRunItem) {
  restoreTarget.value = run
  restorePassword.value = ''
  restoreReason.value = ''
  restoreModalOpen.value = true
}

function closeRestoreModal() {
  restoreModalOpen.value = false
  restoreTarget.value = null
}

async function runRecoveryTestForRun(run: BackupRunItem) {
  recoveryTestBusy.value = run.id
  backupMessage.value = ''
  backupError.value = ''
  try {
    const res = await $fetch<{ valid: boolean, tocEntries: number | null }>(
      `/api/admin/backups/${run.id}/recovery-test`,
      { method: 'POST' },
    )
    backupMessage.value = res.valid
      ? `Recovery test passed — ${res.tocEntries ?? 0} archive entries verified`
      : 'Recovery test failed'
    await refreshRecoveryTests()
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Recovery test failed'
  }
  finally {
    recoveryTestBusy.value = null
  }
}

async function submitRestore() {
  if (!restoreTarget.value) return
  restoreBusy.value = true
  backupMessage.value = ''
  backupError.value = ''
  try {
    await $fetch(`/api/admin/backups/${restoreTarget.value.id}/restore`, {
      method: 'POST',
      body: {
        password: restorePassword.value,
        reason: restoreReason.value.trim(),
      },
    })
    backupMessage.value = `Restore completed from ${restoreTarget.value.filename}`
    closeRestoreModal()
    await Promise.all([refresh(), refreshRuns(), refreshRecoveryTests(), refreshSuspiciousAlerts(), refreshStepUp()])
  }
  catch (e: unknown) {
    const data = (e as { data?: { message?: string, details?: { reason?: string } } })?.data
    backupError.value = data?.details?.reason === 'step_up_required'
      ? 'Step-up verification required — re-enter your password'
      : data?.message ?? 'Restore failed'
  }
  finally {
    restoreBusy.value = false
  }
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

function formatBackupWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
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

const smtpTestTo = ref('')
const smtpBusy = ref(false)
const smtpMessage = ref('')
const smtpError = ref('')

watch(() => auth.user?.email, (email) => {
  if (email && !smtpTestTo.value) smtpTestTo.value = email
}, { immediate: true })

async function runSmtpTest() {
  smtpBusy.value = true
  smtpMessage.value = ''
  smtpError.value = ''
  try {
    const res = await $fetch<{ message: string, delivered: boolean }>('/api/admin/system/smtp-test', {
      method: 'POST',
      body: { to: smtpTestTo.value.trim() || undefined },
    })
    smtpMessage.value = res.message
    await refresh()
  }
  catch (e: unknown) {
    smtpError.value = (e as { data?: { message?: string } })?.data?.message ?? 'SMTP test failed'
  }
  finally {
    smtpBusy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>Control Panel</h2>
        <p>System health, data management, backups, and workspace configuration</p>
      </div>
      <div class="actions">
        <NuxtLink to="/setup" class="btn primary">Server Setup Wizard</NuxtLink>
      </div>
    </div>

    <div v-if="!error && status" class="subtabs" role="tablist" aria-label="Control panel sections">
      <button
        v-for="tab in controlPanelTabs"
        :key="tab.id"
        type="button"
        class="chip"
        :class="{ on: activeTab === tab.id }"
        role="tab"
        :aria-selected="activeTab === tab.id"
        @click="setControlPanelTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="error" class="card" style="padding:24px; margin-bottom:16px;">
      <p>You do not have access to the control panel.</p>
      <NuxtLink to="/dashboard" class="btn">Back to dashboard</NuxtLink>
    </div>

    <template v-else-if="status">
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

      <div v-if="activeTab === 'designer'">
        <ControlPanelTemplateDesigner />
      </div>

      <div v-if="activeTab === 'import'">
        <ControlPanelImportExport />
      </div>

      <div v-show="activeTab === 'email-ai'" class="cols">
        <div class="stack">
          <div class="card">
            <div class="chead">
              <h3>SMTP Test</h3>
            </div>
            <div class="cbody">
              <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
                SMTP is configured in the setup wizard and stored encrypted in PostgreSQL. Send a test message to verify outbound email.
              </p>
              <label class="fld">
                Send test to
                <input v-model="smtpTestTo" type="email" placeholder="you@example.com">
              </label>
              <p v-if="smtpMessage" style="color:#059669; font-size:13px; margin:0 0 10px;">{{ smtpMessage }}</p>
              <p v-if="smtpError" style="color:#dc2626; font-size:13px; margin:0 0 10px;">{{ smtpError }}</p>
              <button class="btn primary" :disabled="smtpBusy" @click="runSmtpTest">
                {{ smtpBusy ? 'Sending…' : 'Send test email' }}
              </button>
            </div>
          </div>

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
      </div>

      <div v-show="activeTab === 'backup'" class="stack">
          <div class="card">
            <div class="chead">
              <h3>Backup</h3>
              <div class="right">
                <span class="pill" :class="status.backup.status === 'healthy' ? 'ok' : status.backup.status === 'error' ? 'over' : 'warn'">
                  {{ backupStatusLabel(status.backup.status) }}
                </span>
              </div>
            </div>
            <dl class="kv">
              <dt>Status</dt>
              <dd>{{ backupStatusLabel(status.backup.status) }}</dd>
              <dt>Schedule</dt>
              <dd>{{ formatScheduleDisplay(status.backup.scheduleEnabled, status.backup.scheduleLabel) }}</dd>
              <dt>Last backup</dt>
              <dd>{{ formatBackupWhen(status.backup.lastRunAt) }}</dd>
              <dt>Destination</dt>
              <dd>{{ backupDestinationLabel(status.backup.driveConnected) }}</dd>
              <dt>Google Drive</dt>
              <dd>{{ driveConnectionLabel(status.backup.driveConnected, status.backup.driveAccountEmail) }}</dd>
              <dt v-if="backupData?.settings">Retention</dt>
              <dd v-if="backupData?.settings">
                {{ backupData.settings.retentionDaily }} daily · {{ backupData.settings.retentionMonthly }} monthly
              </dd>
            </dl>
            <div class="cbody" style="padding-top:0;">
              <div class="tglrow" style="margin-bottom:12px;">
                Nightly schedule
                <span class="tgl"><input v-model="backupForm.enabled" type="checkbox"><span class="tr" /></span>
              </div>
              <label class="fld">
                Notification email
                <input v-model="backupForm.notifyEmail" type="email" placeholder="admin@example.com">
              </label>
              <p v-if="backupMessage" style="color:#059669; font-size:13px; margin:0 0 10px;">{{ backupMessage }}</p>
              <p v-if="backupError" style="color:#dc2626; font-size:13px; margin:0 0 10px;">{{ backupError }}</p>
              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                <button class="btn primary" :disabled="backupBusy" @click="runBackupNow">
                  {{ backupBusy ? 'Running backup…' : 'Run backup now' }}
                </button>
                <button class="btn" :disabled="backupSaveBusy" @click="saveBackupSettings">
                  {{ backupSaveBusy ? 'Saving…' : 'Save settings' }}
                </button>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button
                  v-if="!status.backup.driveConnected"
                  class="btn"
                  :disabled="!backupData?.integration.configured"
                  @click="connectGoogleDrive"
                >
                  Connect Google Drive
                </button>
                <button
                  v-else
                  class="btn"
                  :disabled="driveDisconnectBusy"
                  @click="disconnectGoogleDrive"
                >
                  {{ driveDisconnectBusy ? 'Disconnecting…' : 'Disconnect Drive' }}
                </button>
                <button class="btn" :disabled="driveTestBusy || !status.backup.driveConnected" @click="testDriveConnection">
                  {{ driveTestBusy ? 'Testing…' : 'Test connection' }}
                </button>
              </div>
              <span class="help" style="display:block; margin-top:8px;">
                pg_dump → zstd → AES-256-GCM. Encrypted archives upload to Google Drive when connected.
                Restore requires Super Admin step-up verification and creates a safety backup first.
                {{ backupData?.integration.configured ? '' : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable OAuth.' }}
              </span>
              <p v-if="stepUpStatus?.verified" class="help" style="display:block; margin-top:6px; color:#059669;">
                Step-up verified until {{ formatBackupWhen(stepUpStatus.expiresAt) }}
              </p>
            </div>
            <div v-if="backupRuns?.items?.length" class="tscroll" style="margin-top:12px;">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th class="num">Size</th>
                    <th>Drive</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="run in backupRuns.items" :key="run.id">
                    <td><span class="mono" style="font-size:12px">{{ formatBackupWhen(run.finishedAt ?? run.createdAt) }}</span></td>
                    <td>{{ run.trigger }}</td>
                    <td>
                      <span class="pill" :class="backupRunStatusClass(run.status)">{{ run.status }}</span>
                    </td>
                    <td class="num">{{ formatBackupSize(run.encryptedBytes) }}</td>
                    <td>
                      <span v-if="run.driveFileId" class="pill ok">Uploaded</span>
                      <span v-else class="pill warn">DB only</span>
                    </td>
                    <td>
                      <div v-if="run.status === 'completed'" style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button
                          class="btn sm"
                          :disabled="recoveryTestBusy === run.id"
                          @click="runRecoveryTestForRun(run)"
                        >
                          {{ recoveryTestBusy === run.id ? 'Testing…' : 'Test recovery' }}
                        </button>
                        <button class="btn sm" @click="openRestoreModal(run)">Restore…</button>
                      </div>
                      <span v-else>—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="recoveryTests?.items?.length" class="card">
            <div class="chead">
              <h3>Recovery tests</h3>
              <div class="right"><span class="pill indigo">Verify only</span></div>
            </div>
            <div class="tscroll">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Backup run</th>
                    <th>Status</th>
                    <th class="num">TOC entries</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="test in recoveryTests.items" :key="test.id">
                    <td><span class="mono" style="font-size:12px">{{ formatBackupWhen(test.finishedAt ?? test.createdAt) }}</span></td>
                    <td><span class="mono" style="font-size:11px">{{ test.backupRunId.slice(0, 8) }}…</span></td>
                    <td><span class="pill" :class="recoveryTestStatusClass(test.status)">{{ test.status }}</span></td>
                    <td class="num">{{ test.tocEntries ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
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
    </template>

    <div v-if="restoreModalOpen && restoreTarget" class="modal-scrim" @click.self="closeRestoreModal">
      <div class="card modal-card" style="max-width:480px; width:100%;">
        <div class="chead">
          <h3>Restore database</h3>
          <div class="right"><span class="pill over">Destructive</span></div>
        </div>
        <div class="cbody">
          <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
            Restores from <span class="mono">{{ restoreTarget.filename }}</span>.
            A fresh safety backup runs first. Requires your password (step-up verification).
          </p>
          <label class="fld">
            Reason for restore
            <textarea v-model="restoreReason" rows="3" placeholder="Describe why this restore is needed (min 10 characters)" />
          </label>
          <label class="fld">
            Your password
            <input v-model="restorePassword" type="password" autocomplete="current-password">
          </label>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button
              class="btn primary"
              :disabled="restoreBusy || restoreReason.trim().length < 10 || !restorePassword"
              @click="submitRestore"
            >
              {{ restoreBusy ? 'Restoring…' : 'Begin restore' }}
            </button>
            <button class="btn" :disabled="restoreBusy" @click="closeRestoreModal">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
