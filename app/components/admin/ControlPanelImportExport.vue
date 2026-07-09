<script setup lang="ts">
import { DATA_EXCHANGE_WIPE_CONFIRMATION } from '#shared/validators/data-exchange'

interface DataExchangeTableSummary {
  key: string
  label: string
  description: string
  importable: boolean
  wipeable: boolean
  rowCount: number
}

interface ImportResult {
  mode: string
  table: string
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

interface WipeResult {
  table: string
  deleted: number
  remaining: number
}

const { data, refresh, error: tablesError, pending: tablesPending } = useFetch<{ items: DataExchangeTableSummary[] }>(
  '/api/admin/data-exchange',
  { server: false, lazy: true },
)

const selectedKey = ref<string | null>(null)
const importMode = ref<'upsert' | 'insert_only' | 'dry_run'>('dry_run')
const importFile = ref<File | null>(null)
const importBusy = ref(false)
const importResult = ref<ImportResult | null>(null)
const importError = ref('')

const wipeModalOpen = ref(false)
const wipeTarget = ref<DataExchangeTableSummary | null>(null)
const wipeConfirmation = ref('')
const wipeBusy = ref(false)
const wipeError = ref('')
const wipeMessage = ref('')

const selected = computed(() => data.value?.items.find(t => t.key === selectedKey.value) ?? null)
const wipeConfirmed = computed(() => wipeConfirmation.value === DATA_EXCHANGE_WIPE_CONFIRMATION)

function selectTable(key: string) {
  selectedKey.value = key
  importResult.value = null
  importError.value = ''
  importFile.value = null
}

function exportTable(key: string, format: 'csv' | 'json') {
  window.location.href = `/api/admin/data-exchange/${key}/export?format=${format}`
}

function openWipeModal(table: DataExchangeTableSummary) {
  wipeTarget.value = table
  wipeConfirmation.value = ''
  wipeError.value = ''
  wipeModalOpen.value = true
}

function closeWipeModal() {
  if (wipeBusy.value) return
  wipeModalOpen.value = false
  wipeTarget.value = null
  wipeConfirmation.value = ''
  wipeError.value = ''
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  importFile.value = input.files?.[0] ?? null
  importResult.value = null
  importError.value = ''
}

async function runImport() {
  if (!selectedKey.value || !importFile.value) return
  importBusy.value = true
  importError.value = ''
  importResult.value = null
  try {
    const body = new FormData()
    body.append('file', importFile.value)
    body.append('mode', importMode.value)
    importResult.value = await $fetch<ImportResult>(`/api/admin/data-exchange/${selectedKey.value}/import`, {
      method: 'POST',
      body,
    })
    await refresh()
  }
  catch (e: unknown) {
    importError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Import failed'
  }
  finally {
    importBusy.value = false
  }
}

async function runWipe() {
  if (!wipeTarget.value || !wipeConfirmed.value) return
  wipeBusy.value = true
  wipeError.value = ''
  try {
    const result = await $fetch<WipeResult>(`/api/admin/data-exchange/${wipeTarget.value.key}/wipe`, {
      method: 'POST',
      body: { confirmation: wipeConfirmation.value },
    })
    wipeMessage.value = `Wiped ${result.deleted.toLocaleString()} row${result.deleted === 1 ? '' : 's'} from ${wipeTarget.value.label}.`
    if (selectedKey.value === wipeTarget.value.key) {
      importResult.value = null
      importFile.value = null
    }
    closeWipeModal()
    await refresh()
  }
  catch (e: unknown) {
    wipeError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Wipe failed'
  }
  finally {
    wipeBusy.value = false
  }
}
</script>

<template>
  <div class="ie-banner">
    <b>Per-table import &amp; export</b>
    Export workspace tables to CSV or JSON for backups, migrations, or spreadsheet edits.
    Import supports upsert, insert-only, or dry-run validation. Wipe permanently deletes table rows after you type DELETE.
  </div>

  <p v-if="wipeMessage" class="help" style="color:#059669; margin:0 0 12px;">{{ wipeMessage }}</p>

  <div class="cols">
    <div class="card">
      <div class="chead">
        <h3>Data Tables</h3>
      </div>
      <div v-if="tablesPending" class="cbody" style="font-size:13px; color:#64748b;">Loading tables…</div>
      <div v-else-if="tablesError" class="cbody" style="font-size:13px; color:#dc2626;">
        Could not load data tables. Refresh the page or check your admin permissions.
      </div>
      <div v-else-if="data?.items?.length">
        <div
          v-for="table in data.items"
          :key="table.key"
          class="ie-row"
          :class="{ sel: selectedKey === table.key }"
        >
          <div class="nm">
            <b>{{ table.label }}</b>
            <small>{{ table.description }}</small>
          </div>
          <div class="meta">
            <span class="pill gray">{{ table.rowCount.toLocaleString() }} rows</span>
          </div>
          <div class="acts">
            <button type="button" class="btn sm" @click="exportTable(table.key, 'csv')">Export CSV</button>
            <button type="button" class="btn sm" @click="exportTable(table.key, 'json')">Export JSON</button>
            <button
              v-if="table.importable"
              type="button"
              class="btn sm"
              @click="selectTable(table.key)"
            >
              Import…
            </button>
            <button v-else type="button" class="btn sm" disabled style="opacity:.45">Import…</button>
            <button
              v-if="table.wipeable"
              type="button"
              class="btn sm danger"
              :disabled="table.rowCount === 0"
              @click="openWipeModal(table)"
            >
              Wipe…
            </button>
          </div>
        </div>
      </div>
      <p v-else class="cbody" style="font-size:13px; color:#64748b;">No exportable tables found.</p>
    </div>

    <div class="card">
      <div class="chead">
        <h3>{{ selected ? `Import — ${selected.label}` : 'Import' }}</h3>
        <div class="right">
          <span class="pill indigo">{{ selected ? selected.label : 'Select a table' }}</span>
        </div>
      </div>
      <div class="cbody">
        <template v-if="selected?.importable">
          <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
            Upload a CSV or JSON file exported from this table. Use <b>Validate only</b> first to check rows without writing.
          </p>
          <label class="fld">
            Import mode
            <select v-model="importMode">
              <option value="dry_run">Validate only (dry run)</option>
              <option value="upsert">Upsert by ID</option>
              <option value="insert_only">Insert only (skip existing IDs)</option>
            </select>
          </label>
          <label class="fld">
            File
            <input type="file" accept=".csv,.json,application/json,text/csv" @change="onFileChange">
          </label>
          <p v-if="importError" style="color:#dc2626; font-size:13px;">{{ importError }}</p>
          <div v-if="importResult" style="font-size:13px; margin:12px 0;">
            <p style="color:#059669; margin:0 0 8px;">
              {{ importResult.mode === 'dry_run' ? 'Validation complete' : 'Import complete' }}
              — {{ importResult.total }} rows,
              {{ importResult.inserted }} inserted,
              {{ importResult.updated }} updated,
              {{ importResult.skipped }} skipped
            </p>
            <ul v-if="importResult.errors.length" style="color:#dc2626; margin:0; padding-left:18px;">
              <li v-for="(err, idx) in importResult.errors.slice(0, 8)" :key="idx">{{ err }}</li>
            </ul>
          </div>
          <button
            type="button"
            class="btn primary"
            :disabled="importBusy || !importFile"
            @click="runImport"
          >
            {{ importBusy ? 'Processing…' : importMode === 'dry_run' ? 'Validate file' : 'Run import' }}
          </button>
        </template>
        <p v-else style="font-size:13px; color:#94a3b8; margin:0;">
          Click <b>Import…</b> on a data table to configure format and upload a file, or use <b>Export</b> to download immediately.
        </p>
      </div>
    </div>
  </div>

  <div v-if="wipeModalOpen && wipeTarget" class="modal-scrim open" @click.self="closeWipeModal">
    <div class="card modal-card" style="max-width:480px; width:100%;">
      <div class="chead">
        <h3>Wipe {{ wipeTarget.label }}</h3>
        <div class="right"><span class="pill over">Destructive</span></div>
      </div>
      <div class="cbody">
        <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
          This permanently deletes <strong>{{ wipeTarget.rowCount.toLocaleString() }}</strong> row{{ wipeTarget.rowCount === 1 ? '' : 's' }}
          from <span class="mono">{{ wipeTarget.key }}</span>. Related portal requests may be removed when wiping customers.
          This cannot be undone — export a backup first if you need one.
        </p>
        <label class="fld">
          Type <span class="mono">{{ DATA_EXCHANGE_WIPE_CONFIRMATION }}</span> to confirm
          <input
            v-model="wipeConfirmation"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="DELETE"
            @keydown.enter.prevent="wipeConfirmed && !wipeBusy && runWipe()"
          >
        </label>
        <p v-if="wipeError" style="color:#dc2626; font-size:13px; margin:0 0 10px;">{{ wipeError }}</p>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button
            type="button"
            class="btn danger"
            :disabled="wipeBusy || !wipeConfirmed"
            @click="runWipe"
          >
            {{ wipeBusy ? 'Wiping…' : 'Wipe table' }}
          </button>
          <button type="button" class="btn" :disabled="wipeBusy" @click="closeWipeModal">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
