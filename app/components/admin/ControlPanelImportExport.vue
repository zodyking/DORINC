<script setup lang="ts">
interface DataExchangeTableSummary {
  key: string
  label: string
  description: string
  importable: boolean
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

const { data, refresh } = await useFetch<{ items: DataExchangeTableSummary[] }>('/api/admin/data-exchange')

const selectedKey = ref<string | null>(null)
const importMode = ref<'upsert' | 'insert_only' | 'dry_run'>('dry_run')
const importFile = ref<File | null>(null)
const importBusy = ref(false)
const importResult = ref<ImportResult | null>(null)
const importError = ref('')

const selected = computed(() => data.value?.items.find(t => t.key === selectedKey.value) ?? null)

function selectTable(key: string) {
  selectedKey.value = key
  importResult.value = null
  importError.value = ''
  importFile.value = null
}

function exportTable(key: string, format: 'csv' | 'json') {
  window.location.href = `/api/admin/data-exchange/${key}/export?format=${format}`
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
</script>

<template>
  <div class="ie-banner">
    <b>Per-table import &amp; export</b>
    Export workspace tables to CSV or JSON for backups, migrations, or spreadsheet edits.
    Import supports upsert, insert-only, or dry-run validation. Secrets and password hashes are never included.
  </div>

  <div class="cols">
    <div class="card">
      <div class="chead">
        <h3>Data Tables</h3>
      </div>
      <div v-if="data?.items?.length">
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
          </div>
        </div>
      </div>
      <p v-else class="cbody" style="font-size:13px; color:#64748b;">Loading tables…</p>
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
</template>
