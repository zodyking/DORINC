<script setup lang="ts">
import {
  backupDestinationLabel,
  backupRunStatusClass,
  backupStatusLabel,
  driveConnectionLabel,
  formatBackupSize,
  formatScheduleDisplay,
  recoveryTestStatusClass,
} from '~/utils/admin-panel-ui'

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

const props = defineProps<{
  backupStatus: {
    status: 'not_configured' | 'healthy' | 'error'
    message: string
    lastRunAt: string | null
    lastFilename: string | null
    scheduleEnabled: boolean
    scheduleLabel: string
    driveConnected: boolean
    driveAccountEmail: string | null
  }
}>()

const emit = defineEmits<{
  refreshed: []
}>()

const auth = useAuthStore()
const route = useRoute()
const canManageBackups = computed(() => auth.can('backups.manage.all'))
const canRestore = computed(() => auth.user?.accountType === 'super_admin')

const backupBusy = ref(false)
const backupSaveBusy = ref(false)
const backupMessage = ref('')
const backupError = ref('')
const driveTestBusy = ref(false)
const driveDisconnectBusy = ref(false)
const recoveryTestBusy = ref<string | null>(null)
const showRecoveryTests = ref(false)

const restoreModalOpen = ref(false)
const restoreMode = ref<'run' | 'upload'>('run')
const restoreTarget = ref<BackupRunItem | null>(null)
const restoreFile = ref<File | null>(null)
const restorePassword = ref('')
const restoreReason = ref('')
const restoreBusy = ref(false)

const { data: backupData, refresh: refreshBackupData } = useFetch<{
  integration: BackupIntegrationView
  settings: BackupSettingsView
}>('/api/admin/backups/integration', {
  server: false,
  lazy: true,
  immediate: canManageBackups.value,
})

const backupForm = reactive({
  enabled: false,
  notifyEmail: '' as string,
})

watch(() => backupData.value?.settings, (s) => {
  if (!s) return
  backupForm.enabled = s.enabled
  backupForm.notifyEmail = s.notifyEmail ?? ''
}, { immediate: true })

const { data: backupRuns, refresh: refreshRuns } = useFetch<{ items: BackupRunItem[] }>(
  '/api/admin/backups/runs',
  { server: false, lazy: true, immediate: canManageBackups.value },
)

const { data: recoveryTests, refresh: refreshRecoveryTests } = useFetch<{ items: RecoveryTestItem[] }>(
  '/api/admin/backups/recovery-tests',
  { server: false, lazy: true, immediate: canManageBackups.value },
)

const { data: stepUpStatus, refresh: refreshStepUp } = useFetch<{ verified: boolean, expiresAt: string | null }>(
  '/api/auth/step-up/status',
  { server: false, lazy: true, immediate: canManageBackups.value },
)

const latestRun = computed(() => backupRuns.value?.items?.[0] ?? null)

function formatBackupWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function shortFilename(name: string): string {
  if (name.length <= 42) return name
  return `${name.slice(0, 22)}…${name.slice(-16)}`
}

async function refreshAll() {
  await Promise.all([refreshBackupData(), refreshRuns(), refreshRecoveryTests(), refreshStepUp()])
  emit('refreshed')
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
  refreshAll()
}, { immediate: true })

async function runBackupNow() {
  backupBusy.value = true
  backupMessage.value = ''
  backupError.value = ''
  try {
    const res = await $fetch<{ filename: string, status?: string, errorMessage?: string | null }>(
      '/api/admin/backups/run',
      { method: 'POST' },
    )
    backupMessage.value = res.errorMessage
      ? `Backup saved locally — Drive warning: ${res.errorMessage}`
      : `Backup completed — ${res.filename}`
    await refreshAll()
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Backup failed'
    await refreshRuns()
  }
  finally {
    backupBusy.value = false
  }
}

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
    await refreshAll()
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    backupSaveBusy.value = false
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
    await refreshAll()
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
    await refreshAll()
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Connection test failed'
  }
  finally {
    driveTestBusy.value = false
  }
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
    showRecoveryTests.value = true
    await refreshRecoveryTests()
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Recovery test failed'
  }
  finally {
    recoveryTestBusy.value = null
  }
}

function downloadBackup(run: BackupRunItem) {
  window.location.href = `/api/admin/backups/${run.id}/download`
}

function openRestoreFromRun(run: BackupRunItem) {
  restoreMode.value = 'run'
  restoreTarget.value = run
  restoreFile.value = null
  restorePassword.value = ''
  restoreReason.value = ''
  restoreModalOpen.value = true
}

function openRestoreFromFile() {
  restoreMode.value = 'upload'
  restoreTarget.value = null
  restoreFile.value = null
  restorePassword.value = ''
  restoreReason.value = ''
  restoreModalOpen.value = true
}

function closeRestoreModal() {
  if (restoreBusy.value) return
  restoreModalOpen.value = false
  restoreTarget.value = null
  restoreFile.value = null
}

function onRestoreFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  restoreFile.value = input.files?.[0] ?? null
}

async function submitRestore() {
  restoreBusy.value = true
  backupMessage.value = ''
  backupError.value = ''
  try {
    if (restoreMode.value === 'upload') {
      if (!restoreFile.value) return
      const body = new FormData()
      body.append('file', restoreFile.value)
      body.append('password', restorePassword.value)
      body.append('reason', restoreReason.value.trim())
      const res = await $fetch<{ restoredFilename: string }>('/api/admin/backups/restore-upload', {
        method: 'POST',
        body,
      })
      backupMessage.value = `Restore completed from ${res.restoredFilename}`
    }
    else {
      if (!restoreTarget.value) return
      await $fetch(`/api/admin/backups/${restoreTarget.value.id}/restore`, {
        method: 'POST',
        body: {
          password: restorePassword.value,
          reason: restoreReason.value.trim(),
        },
      })
      backupMessage.value = `Restore completed from ${restoreTarget.value.filename}`
    }
    closeRestoreModal()
    await refreshAll()
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

const restoreReady = computed(() => {
  if (restoreBusy.value) return false
  if (restoreReason.value.trim().length < 10 || !restorePassword.value) return false
  if (restoreMode.value === 'upload') return !!restoreFile.value
  return !!restoreTarget.value
})
</script>

<template>
  <div v-if="!canManageBackups" class="cp-state">
    You do not have permission to manage backups.
  </div>

  <div v-else class="br">
    <p v-if="backupMessage" class="br-flash br-flash--ok" role="status">{{ backupMessage }}</p>
    <p v-if="backupError" class="br-flash br-flash--err" role="alert">{{ backupError }}</p>

    <!-- 1. Status + primary actions -->
    <section class="br-hero">
      <div class="br-hero__status">
        <span
          class="pill"
          :class="props.backupStatus.status === 'healthy' ? 'ok' : props.backupStatus.status === 'error' ? 'over' : 'warn'"
        >
          {{ backupStatusLabel(props.backupStatus.status) }}
        </span>
        <div class="br-hero__meta">
          <p>
            <strong>{{ backupDestinationLabel(props.backupStatus.driveConnected) }}</strong>
            · {{ formatScheduleDisplay(props.backupStatus.scheduleEnabled, props.backupStatus.scheduleLabel) }}
          </p>
          <p>
            Last backup {{ formatBackupWhen(props.backupStatus.lastRunAt) }}
            <template v-if="backupData?.settings">
              · keep {{ backupData.settings.retentionDaily }} daily / {{ backupData.settings.retentionMonthly }} monthly
            </template>
          </p>
          <p v-if="latestRun?.status === 'failed' && latestRun.errorMessage" class="br-hero__error">
            {{ latestRun.errorMessage }}
          </p>
          <p v-else-if="latestRun?.status === 'completed' && latestRun.errorMessage" class="br-hero__warn">
            Drive warning: {{ latestRun.errorMessage }}
          </p>
        </div>
      </div>
      <div class="br-hero__actions">
        <button type="button" class="btn primary" :disabled="backupBusy" @click="runBackupNow">
          {{ backupBusy ? 'Running…' : 'Run backup now' }}
        </button>
        <button
          v-if="canRestore"
          type="button"
          class="btn"
          @click="openRestoreFromFile"
        >
          Restore from file…
        </button>
      </div>
    </section>

    <!-- 2. Recent backups -->
    <section class="br-block">
      <header class="br-block__head">
        <h3>Recent backups</h3>
        <span class="pill gray">{{ backupRuns?.items?.length ?? 0 }}</span>
      </header>

      <div v-if="backupRuns?.items?.length" class="tscroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>File</th>
              <th>Status</th>
              <th class="num">Size</th>
              <th>Copy</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in backupRuns.items" :key="run.id">
              <td>
                <span class="mono br-when">{{ formatBackupWhen(run.finishedAt ?? run.createdAt) }}</span>
                <span class="br-trigger">{{ run.trigger }}</span>
              </td>
              <td>
                <span class="mono br-file" :title="run.filename">{{ shortFilename(run.filename) }}</span>
                <span v-if="run.errorMessage" class="br-run-error" :title="run.errorMessage">
                  {{ run.errorMessage }}
                </span>
              </td>
              <td>
                <span class="pill" :class="backupRunStatusClass(run.status)">{{ run.status }}</span>
              </td>
              <td class="num">{{ formatBackupSize(run.encryptedBytes) }}</td>
              <td>
                <span v-if="run.driveFileId" class="pill ok">Drive</span>
                <span v-else class="pill gray">Local</span>
              </td>
              <td>
                <div v-if="run.status === 'completed'" class="br-row-actions">
                  <button type="button" class="btn sm" @click="downloadBackup(run)">Download</button>
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="recoveryTestBusy === run.id"
                    @click="runRecoveryTestForRun(run)"
                  >
                    {{ recoveryTestBusy === run.id ? 'Testing…' : 'Verify' }}
                  </button>
                  <button
                    v-if="canRestore"
                    type="button"
                    class="btn sm"
                    @click="openRestoreFromRun(run)"
                  >
                    Restore…
                  </button>
                </div>
                <span v-else class="br-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="br-empty">
        No backups yet. Run a backup to create the first encrypted archive
        (<span class="mono">pg_dump → zstd → AES-256-GCM</span>).
      </p>
    </section>

    <!-- 3. Settings: schedule + Drive in one strip -->
    <section class="br-block">
      <header class="br-block__head">
        <h3>Settings</h3>
      </header>

      <div class="br-settings">
        <div class="br-settings__col">
          <h4>Schedule &amp; alerts</h4>
          <label class="tglrow br-tgl">
            Nightly schedule
            <span class="tgl"><input v-model="backupForm.enabled" type="checkbox"><span class="tr" /></span>
          </label>
          <label class="fld">
            Notification email
            <input v-model="backupForm.notifyEmail" type="email" placeholder="admin@example.com">
          </label>
          <button type="button" class="btn" :disabled="backupSaveBusy" @click="saveBackupSettings">
            {{ backupSaveBusy ? 'Saving…' : 'Save settings' }}
          </button>
          <p v-if="stepUpStatus?.verified" class="br-hint br-hint--ok">
            Step-up verified until {{ formatBackupWhen(stepUpStatus.expiresAt) }}
          </p>
          <p class="br-hint">
            Restore requires Super Admin password verification and creates a safety backup first.
          </p>
        </div>

        <div class="br-settings__col">
          <h4>Google Drive <span class="pill" :class="props.backupStatus.driveConnected ? 'ok' : 'warn'">{{ props.backupStatus.driveConnected ? 'Connected' : 'Optional' }}</span></h4>
          <p class="br-hint">
            {{ driveConnectionLabel(props.backupStatus.driveConnected, props.backupStatus.driveAccountEmail) }}.
            Offsite copy after each successful local backup.
          </p>
          <p v-if="!backupData?.integration.configured" class="br-hint br-hint--warn">
            Set <span class="mono">GOOGLE_CLIENT_ID</span> / <span class="mono">GOOGLE_CLIENT_SECRET</span> to enable OAuth.
          </p>
          <div class="br-row-actions">
            <button
              v-if="!props.backupStatus.driveConnected"
              type="button"
              class="btn"
              :disabled="!backupData?.integration.configured"
              @click="connectGoogleDrive"
            >
              Connect Drive
            </button>
            <button
              v-else
              type="button"
              class="btn"
              :disabled="driveDisconnectBusy"
              @click="disconnectGoogleDrive"
            >
              {{ driveDisconnectBusy ? 'Disconnecting…' : 'Disconnect' }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="driveTestBusy || !props.backupStatus.driveConnected"
              @click="testDriveConnection"
            >
              {{ driveTestBusy ? 'Testing…' : 'Test connection' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. Recovery tests (collapsed unless used) -->
    <section v-if="recoveryTests?.items?.length" class="br-block br-block--muted">
      <button
        type="button"
        class="br-disclosure"
        :aria-expanded="showRecoveryTests"
        @click="showRecoveryTests = !showRecoveryTests"
      >
        <span>Recovery tests</span>
        <span class="pill indigo">{{ recoveryTests.items.length }}</span>
        <span class="br-disclosure__chev">{{ showRecoveryTests ? '▾' : '▸' }}</span>
      </button>
      <div v-if="showRecoveryTests" class="tscroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Backup</th>
              <th>Status</th>
              <th class="num">Entries</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="test in recoveryTests.items" :key="test.id">
              <td><span class="mono br-when">{{ formatBackupWhen(test.finishedAt ?? test.createdAt) }}</span></td>
              <td><span class="mono">{{ test.backupRunId.slice(0, 8) }}…</span></td>
              <td><span class="pill" :class="recoveryTestStatusClass(test.status)">{{ test.status }}</span></td>
              <td class="num">{{ test.tocEntries ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <div v-if="restoreModalOpen" class="modal-scrim open" @click.self="closeRestoreModal">
    <div class="card modal-card br-modal">
      <div class="chead">
        <h3>{{ restoreMode === 'upload' ? 'Restore from file' : 'Restore database' }}</h3>
        <div class="right"><span class="pill over">Destructive</span></div>
      </div>
      <div class="cbody">
        <p class="br-hint">
          <template v-if="restoreMode === 'upload'">
            Upload an encrypted <span class="mono">.dump.zst.enc</span> backup from this workspace.
          </template>
          <template v-else>
            Restores from <span class="mono">{{ restoreTarget?.filename }}</span>.
          </template>
          A safety backup runs first. Enter your password to confirm.
        </p>
        <label v-if="restoreMode === 'upload'" class="fld">
          Backup file
          <input type="file" accept=".enc,application/octet-stream" @change="onRestoreFileChange">
        </label>
        <label class="fld">
          Reason for restore
          <textarea v-model="restoreReason" rows="3" placeholder="Why is this restore needed? (min 10 characters)" />
        </label>
        <label class="fld">
          Your password
          <input v-model="restorePassword" type="password" autocomplete="current-password">
        </label>
        <div class="br-row-actions br-modal__actions">
          <button
            type="button"
            class="btn primary"
            :disabled="!restoreReady"
            @click="submitRestore"
          >
            {{ restoreBusy ? 'Restoring…' : 'Begin restore' }}
          </button>
          <button type="button" class="btn" :disabled="restoreBusy" @click="closeRestoreModal">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.br {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.br-flash {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.4;
}
.br-flash--ok {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
.br-flash--err {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.br-hero {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
}
.br-hero__status {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: min(100%, 360px);
  flex: 1;
}
.br-hero__meta {
  display: grid;
  gap: 4px;
}
.br-hero__meta p {
  margin: 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.4;
}
.br-hero__meta strong {
  color: #0f172a;
  font-weight: 700;
}
.br-hero__error {
  color: #b91c1c !important;
}
.br-hero__warn {
  color: #b45309 !important;
}
.br-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.br-block {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
}
.br-block--muted {
  background: #f8fafc;
}
.br-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
}
.br-block__head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}
.br-empty {
  margin: 0;
  padding: 18px 16px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.br-when {
  display: block;
  font-size: 12px;
}
.br-trigger {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #94a3b8;
  text-transform: lowercase;
}
.br-file {
  display: block;
  font-size: 11px;
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.br-run-error {
  display: block;
  margin-top: 3px;
  max-width: 36ch;
  font-size: 11px;
  color: #b91c1c;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.br-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.br-muted { color: #94a3b8; }

.br-settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.br-settings__col {
  padding: 14px 16px 16px;
  display: grid;
  gap: 10px;
  align-content: start;
}
.br-settings__col + .br-settings__col {
  border-left: 1px solid #f1f5f9;
}
.br-settings__col h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
}
.br-tgl { margin: 0; }
.br-hint {
  margin: 0;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.45;
}
.br-hint--ok { color: #047857; }
.br-hint--warn { color: #b45309; }

.br-disclosure {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
  text-align: left;
}
.br-disclosure__chev {
  margin-left: auto;
  color: #94a3b8;
  font-weight: 400;
}

.br-modal {
  max-width: 480px;
  width: 100%;
}
.br-modal__actions { margin-top: 4px; }

@media (max-width: 800px) {
  .br-settings { grid-template-columns: 1fr; }
  .br-settings__col + .br-settings__col {
    border-left: 0;
    border-top: 1px solid #f1f5f9;
  }
}
</style>
