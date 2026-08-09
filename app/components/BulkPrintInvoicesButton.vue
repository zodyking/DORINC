<script setup lang="ts">
import { invoiceDateDisplay, moneyDisplay, type InvoiceStatus } from '~/utils/invoices-ui'
import { assertPdfBlob, syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { printPdfBlob } from '~/utils/print-pdf'

withDefaults(defineProps<{
  buttonClass?: string
  disabled?: boolean
  hideTrigger?: boolean
}>(), {
  buttonClass: 'btn',
  disabled: false,
  hideTrigger: false,
})

const emit = defineEmits<{ printed: [] }>()

const auth = useAuthStore()
const canPrint = computed(() =>
  auth.loaded && (
    auth.can('invoices.read.all')
    || auth.can('invoices.generate_pdf.all')
    || auth.can('staples.print.all')
  ),
)
const canStaples = computed(() =>
  auth.can('staples.print.all')
  || auth.can('invoices.read.all')
  || auth.can('invoices.update.all'),
)

interface PrintableInvoice {
  id: string
  invoiceNumberFormatted: string
  status: InvoiceStatus
  total: string
  invoiceDate: string
  dueDate: string | null
  customerName: string
}

type Phase = 'choose' | 'select' | 'working'
type PrintMode = 'device' | 'staples'

const open = ref(false)
const phase = ref<Phase>('choose')
const mode = ref<PrintMode>('device')
const error = ref('')
const selected = ref<Set<string>>(new Set())
const busy = ref(false)

const {


  data: invoicesData,
  refresh: refreshInvoices,
  pending: invoicesPending,
} = useFetch<{ items: PrintableInvoice[] }>('/api/invoices', {
  key: 'bulk-print-invoices',
  query: { pageSize: 100, sort: 'newest' },
  lazy: true,
  server: false,
  immediate: false,
})

const invoices = computed(() => invoicesData.value?.items ?? [])
const allSelected = computed(() => invoices.value.length > 0 && selected.value.size === invoices.value.length)
const selectedCount = computed(() => selected.value.size)

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(invoices.value.map(i => i.id))
}

function closeModal() {
  if (busy.value) return
  open.value = false
  phase.value = 'choose'
  error.value = ''
  selected.value = new Set()
  mode.value = 'device'
}

async function openModal() {
  open.value = true
  phase.value = 'choose'
  error.value = ''
  selected.value = new Set()
  mode.value = 'device'
  await refreshInvoices()
}

function chooseMode(next: PrintMode) {
  if (next === 'staples' && !canStaples.value) {
    error.value = 'You do not have permission to send Staples print orders'
    return
  }
  mode.value = next
  error.value = ''
  phase.value = 'select'
}

function backToChoose() {
  if (busy.value) return
  phase.value = 'choose'
  error.value = ''
}

async function submit() {
  if (!selected.value.size) {
    error.value = 'Select at least one invoice.'
    return
  }
  busy.value = true
  error.value = ''
  phase.value = 'working'
  try {
    if (mode.value === 'device') {
      const blob = await $fetch<Blob>('/api/invoices/bulk-print', {
        method: 'POST',
        body: {
          invoiceIds: [...selected.value],
          mode: 'device',
        },
        responseType: 'blob',
      })
      await assertPdfBlob(blob)
      open.value = false
      await printPdfBlob(blob)
      emit('printed')
    }
    else {
      const res = await $fetch<{ mode: 'staples', job: { id: string, status: string, errorMessage: string | null } }>(
        '/api/invoices/bulk-print',
        {
          method: 'POST',
          body: {
            invoiceIds: [...selected.value],
            mode: 'staples',
          },
        },
      )
      if (res.job.status === 'failed') {
        error.value = res.job.errorMessage || 'Could not email Staples PrintMe'
        phase.value = 'select'
        return
      }
      open.value = false
      emit('printed')
      await navigateTo('/staples')
    }
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Bulk print failed')
    phase.value = 'select'
  }
  finally {
    busy.value = false
  }
}

defineExpose({ openModal })
</script>

<template>
  <button
    v-if="canPrint && !hideTrigger"
    type="button"
    :class="buttonClass"
    :disabled="disabled"
    @click="openModal"
  >
    Bulk print
  </button>

  <Teleport to="body">
    <div v-if="open" class="modal-scrim open" @click.self="closeModal">
      <div class="card modal-card" style="max-width:640px; width:100%;">
        <div class="chead">
          <h3>
            {{ phase === 'choose' ? 'Bulk print invoices' : (mode === 'staples' ? 'Bulk print via Staples' : 'Bulk print on this device') }}
          </h3>
        </div>
        <div class="cbody">
          <template v-if="phase === 'choose'">
            <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
              Choose how to print. Selected invoices are merged into one PDF, newest to oldest.
            </p>
            <div class="bulk-print-options" role="list">
              <button
                type="button"
                class="bulk-print-option"
                role="listitem"
                :disabled="busy"
                @click="chooseMode('device')"
              >
                <span class="bulk-print-option__title">Print from this device</span>
                <span class="bulk-print-option__desc">
                  Merge invoices into one PDF and open the browser print dialog
                </span>
              </button>
              <button
                type="button"
                class="bulk-print-option"
                role="listitem"
                :disabled="busy || !canStaples"
                @click="chooseMode('staples')"
              >
                <span class="bulk-print-option__title">Send to Staples PrintMe</span>
                <span class="bulk-print-option__desc">
                  Email one merged PDF and get a release code on the Staples page
                </span>
              </button>
            </div>
            <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button type="button" class="btn" :disabled="busy" @click="closeModal">Cancel</button>
            </div>
          </template>

          <template v-else-if="phase === 'select' || phase === 'working'">
            <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
              Check the invoices to include. They will be ordered newest to oldest in the merged PDF.
            </p>

            <div class="bulk-list">
              <div class="bulk-list__head">
                <label class="bulk-check">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    :disabled="!invoices.length || busy"
                    @change="toggleAll"
                  >
                  <span>Invoices ({{ invoices.length }})</span>
                </label>
                <span class="help" style="margin:0;">{{ selectedCount }} selected</span>
              </div>

              <div v-if="invoicesPending" class="cp-state">Loading invoices…</div>
              <div v-else-if="!invoices.length" class="empty" style="padding:18px;">
                No invoices available to print.
              </div>
              <ul v-else class="bulk-rows">
                <li v-for="inv in invoices" :key="inv.id">
                  <label class="bulk-check">
                    <input
                      type="checkbox"
                      :checked="selected.has(inv.id)"
                      :disabled="busy"
                      @change="toggle(inv.id)"
                    >
                    <span class="bulk-rows__num">{{ inv.invoiceNumberFormatted }}</span>
                    <span class="help" style="margin:0;">{{ inv.customerName }}</span>
                  </label>
                  <span class="bulk-rows__meta">
                    <span>{{ invoiceDateDisplay(inv.invoiceDate) }}</span>
                    <b>{{ moneyDisplay(inv.total) }}</b>
                  </span>
                </li>
              </ul>
            </div>

            <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
            <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
              <button
                type="button"
                class="btn primary"
                :disabled="busy || !selectedCount"
                @click="submit"
              >
                {{ busy
                  ? (mode === 'staples' ? 'Sending…' : 'Preparing…')
                  : (mode === 'staples'
                    ? `Send ${selectedCount || ''} to Staples`
                    : `Print ${selectedCount || ''} invoice${selectedCount === 1 ? '' : 's'}`) }}
              </button>
              <button type="button" class="btn" :disabled="busy" @click="backToChoose">Back</button>
              <button type="button" class="btn" :disabled="busy" @click="closeModal">Cancel</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bulk-print-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bulk-print-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.bulk-print-option:hover:not(:disabled) {
  border-color: #c7d2fe;
  background: #f8fafc;
}
.bulk-print-option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.bulk-print-option__title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}
.bulk-print-option__desc {
  font-size: 13px;
  color: #64748b;
  line-height: 1.4;
}
.bulk-list {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.bulk-list__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.bulk-check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  cursor: pointer;
}
.bulk-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow: auto;
}
.bulk-rows li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.bulk-rows li:last-child {
  border-bottom: 0;
}
.bulk-rows__num {
  font-weight: 700;
  color: #1d4ed8;
}
.bulk-rows__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}
</style>
