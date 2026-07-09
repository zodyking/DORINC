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

function formatBackupWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
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
    const res = await $fetch<{ filename: string }>('/api/admin/backups/run', { method: 'POST' })
    backupMessage.value = `Backup completed — ${res.filename}`
    await refreshAll()
  }
  catch (e: unknown) {
    backupError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Backup failed'
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

  <div v-else class="stack">
    <div class="ie-banner">
      <b>Encrypted backups</b>
      Nightly or on-demand dumps are compressed and AES-encrypted in the database.
      Connect Google Drive for offsite copies, download local <span class="mono">.enc</span> files, or restore from a saved file.
    </div>

    <p v-if="backupMessage" class="help" style="color:#059669; margin:0;">{{ backupMessage }}</p>
    <p v-if="backupError" class="help" style="color:#dc2626; margin:0;">{{ backupError }}</p>

    <div class="cols">
      <div class="stack">
        <div class="card">
          <div class="chead">
            <h3>Status</h3>
            <div class="right">
              <span
                class="pill"
                :class="props.backupStatus.status === 'healthy' ? 'ok' : props.backupStatus.status === 'error' ? 'over' : 'warn'"
              >
                {{ backupStatusLabel(props.backupStatus.status) }}
              </span>
            </div>
          </div>
          <dl class="kv">
            <dt>Destination</dt>
            <dd>{{ backupDestinationLabel(props.backupStatus.driveConnected) }}</dd>
            <dt>Schedule</dt>
            <dd>{{ formatScheduleDisplay(props.backupStatus.scheduleEnabled, props.backupStatus.scheduleLabel) }}</dd>
            <dt>Last backup</dt>
            <dd>{{ formatBackupWhen(props.backupStatus.lastRunAt) }}</dd>
            <dt>Retention</dt>
            <dd v-if="backupData?.settings">
              {{ backupData.settings.retentionDaily }} daily · {{ backupData.settings.retentionMonthly }} monthly
            </dd>
            <dd v-else>—</dd>
          </dl>
          <div class="cbody" style="padding-top:0; display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn primary" :disabled="backupBusy" @click="runBackupNow">
              {{ backupBusy ? 'Running backup…' : 'Run backup now' }}
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
        </div>

        <div class="card">
          <div class="chead"><h3>Schedule &amp; alerts</h3></div>
          <div class="cbody">
            <div class="tglrow" style="margin-bottom:12px;">
              Nightly schedule
              <span class="tgl"><input v-model="backupForm.enabled" type="checkbox"><span class="tr" /></span>
            </div>
            <label class="fld">
              Notification email
              <input v-model="backupForm.notifyEmail" type="email" placeholder="admin@example.com">
            </label>
            <button type="button" class="btn" :disabled="backupSaveBusy" @click="saveBackupSettings">
              {{ backupSaveBusy ? 'Saving…' : 'Save settings' }}
            </button>
            <span class="help" style="display:block; margin-top:10px;">
              pg_dump → zstd → AES-256-GCM. Restore requires Super Admin password verification and creates a safety backup first.
            </span>
            <p v-if="stepUpStatus?.verified" class="help" style="display:block; margin-top:6px; color:#059669;">
              Step-up verified until {{ formatBackupWhen(stepUpStatus.expiresAt) }}
            </p>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="chead">
            <h3>Google Drive</h3>
            <div class="right">
              <span class="pill" :class="props.backupStatus.driveConnected ? 'ok' : 'warn'">
                {{ props.backupStatus.driveConnected ? 'Connected' : 'Not connected' }}
              </span>
            </div>
          </div>
          <dl class="kv">
            <dt>Account</dt>
            <dd>{{ driveConnectionLabel(props.backupStatus.driveConnected, props.backupStatus.driveAccountEmail) }}</dd>
            <dt>OAuth</dt>
            <dd>{{ backupData?.integration.configured ? 'Configured' : 'Needs GOOGLE_CLIENT_ID / SECRET' }}</dd>
          </dl>
          <div class="cbody" style="padding-top:0; display:flex; gap:8px; flex-wrap:wrap;">
            <button
              v-if="!props.backupStatus.driveConnected"
              type="button"
              class="btn"
              :disabled="!backupData?.integration.configured"
              @click="connectGoogleDrive"
            >
              Connect Google Drive
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

        <div class="card">
          <div class="chead">
            <h3>Local restore</h3>
            <div class="right"><span class="pill indigo">Offline file</span></div>
          </div>
          <div class="cbody">
            <p style="font-size:13px; color:#64748b; margin:0 0 12px; line-height:1.5;">
              Download any completed backup as an encrypted <span class="mono">.dump.zst.enc</span> file.
              Later, restore that file here — useful when Drive is unavailable or you keep offline copies.
            </p>
            <button
              v-if="canRestore"
              type="button"
              class="btn"
              @click="openRestoreFromFile"
            >
              Choose backup file…
            </button>
            <p v-else class="help" style="margin:0;">Only Super Admins can restore from a local file.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="chead">
        <h3>Recent backups</h3>
        <div class="right">
          <span class="pill gray">{{ backupRuns?.items?.length ?? 0 }} runs</span>
        </div>
      </div>
      <div v-if="backupRuns?.items?.length" class="tscroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>File</th>
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
              <td><span class="mono" style="font-size:11px">{{ run.filename }}</span></td>
              <td>{{ run.trigger }}</td>
              <td>
                <span class="pill" :class="backupRunStatusClass(run.status)">{{ run.status }}</span>
              </td>
              <td class="num">{{ formatBackupSize(run.encryptedBytes) }}</td>
              <td>
                <span v-if="run.driveFileId" class="pill ok">Uploaded</span>
                <span v-else class="pill warn">Local</span>
              </td>
              <td>
                <div v-if="run.status === 'completed'" style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn sm" @click="downloadBackup(run)">Download</button>
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="recoveryTestBusy === run.id"
                    @click="runRecoveryTestForRun(run)"
                  >
                    {{ recoveryTestBusy === run.id ? 'Testing…' : 'Test' }}
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
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="cbody" style="font-size:13px; color:#64748b; margin:0;">
        No backups yet — run a manual backup to create the first encrypted archive.
      </p>
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

  <div v-if="restoreModalOpen" class="modal-scrim open" @click.self="closeRestoreModal">
    <div class="card modal-card" style="max-width:480px; width:100%;">
      <div class="chead">
        <h3>{{ restoreMode === 'upload' ? 'Restore from file' : 'Restore database' }}</h3>
        <div class="right"><span class="pill over">Destructive</span></div>
      </div>
      <div class="cbody">
        <p style="font-size:13px; color:#64748b; margin:0 0 14px; line-height:1.5;">
          <template v-if="restoreMode === 'upload'">
            Upload an encrypted <span class="mono">.dump.zst.enc</span> backup downloaded from this workspace.
          </template>
          <template v-else>
            Restores from <span class="mono">{{ restoreTarget?.filename }}</span>.
          </template>
          A fresh safety backup runs first. Requires your password (step-up verification).
        </p>
        <label v-if="restoreMode === 'upload'" class="fld">
          Backup file
          <input type="file" accept=".enc,application/octet-stream" @change="onRestoreFileChange">
        </label>
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
