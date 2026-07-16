<script setup lang="ts">
import { invoiceDateDisplay, isInvoiceEmailable, isInvoiceResend, moneyDisplay, type InvoiceStatus } from '~/utils/invoices-ui'

const BULK_SEND_STATUSES = 'draft,pending_manager_approval,sent,paid'

const props = withDefaults(defineProps<{
  buttonClass?: string
  disabled?: boolean
}>(), {
  buttonClass: 'btn',
  disabled: false,
})

const emit = defineEmits<{ sent: [] }>()

const auth = useAuthStore()
const canSend = computed(() => auth.loaded && auth.can('invoices.send.all'))

interface CustomerPick {
  id: string
  displayName: string
  email: string | null
  primaryContact: { email: string | null } | null
}

interface SendableInvoice {
  id: string
  invoiceNumberFormatted: string
  status: InvoiceStatus
  total: string
  dueDate: string | null
}

interface BulkApiResult {
  invoiceId: string
  invoiceNumber: string
  queued: boolean
  alreadyQueued: boolean
  alreadySent: boolean
  error: string | null
}

type DeliveryState = 'pending' | 'queued' | 'processing' | 'sent' | 'failed'

interface BulkResultRow {
  invoiceId: string
  invoiceNumber: string
  queueError: string | null
  alreadyQueued: boolean
  alreadySent: boolean
  state: DeliveryState
  stateError: string | null
}

type Phase = 'select' | 'progress'

const open = ref(false)
const phase = ref<Phase>('select')
const error = ref('')

const customerId = ref('')
const message = ref('')
const selected = ref<Set<string>>(new Set())
const busy = ref(false)

const results = ref<BulkResultRow[]>([])
const sentRecipient = ref<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | undefined

const {
  data: customersData,
  refresh: refreshCustomers,
} = useFetch<{ items: CustomerPick[] }>('/api/customers', {
  key: 'bulk-send-customers',
  query: { pageSize: 100, sort: 'name-asc' },
  lazy: true,
  server: false,
  immediate: false,
})

const {
  data: invoicesData,
  refresh: refreshInvoices,
  pending: invoicesPending,
} = useFetch<{ items: SendableInvoice[] }>('/api/invoices', {
  key: 'bulk-send-invoices',
  query: computed(() => ({
    customerId: customerId.value || undefined,
    statuses: BULK_SEND_STATUSES,
    pageSize: 100,
    sort: 'newest',
  })),
  lazy: true,
  server: false,
  immediate: false,
  watch: false,
})

const customers = computed(() => customersData.value?.items ?? [])
const invoices = computed(() => invoicesData.value?.items ?? [])

const selectedCustomer = computed(() => customers.value.find(c => c.id === customerId.value) ?? null)
const recipientEmail = computed(() =>
  selectedCustomer.value?.primaryContact?.email || selectedCustomer.value?.email || null,
)

const allSelected = computed(() => invoices.value.length > 0 && selected.value.size === invoices.value.length)
const selectedCount = computed(() => selected.value.size)

const progressSummary = computed(() => {
  const rows = results.value
  if (!rows.length) return null
  const requested = rows.length
  const sent = rows.filter(r => r.state === 'sent').length
  const failed = rows.filter(r => r.state === 'failed').length
  const inFlight = rows.filter(r => ['pending', 'queued', 'processing'].includes(r.state)).length
  return { requested, sent, failed, inFlight, done: inFlight === 0 }
})

const progressHeadline = computed(() => {
  const summary = progressSummary.value
  if (!summary) return 'Sending invoices…'
  if (summary.inFlight > 0) {
    return `Sending ${summary.sent + summary.failed} of ${summary.requested} invoice${summary.requested === 1 ? '' : 's'}…`
  }
  if (summary.failed === 0) {
    return `${summary.sent} of ${summary.requested} invoice${summary.requested === 1 ? '' : 's'} sent`
  }
  if (summary.sent === 0) {
    return `Could not send ${summary.failed} invoice${summary.failed === 1 ? '' : 's'}`
  }
  return `${summary.sent} sent · ${summary.failed} failed`
})

watch(customerId, () => {
  selected.value = new Set()
  if (customerId.value) void refreshInvoices()
})

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

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
  stopPolling()
  open.value = false
}

async function openModal() {
  stopPolling()
  open.value = true
  phase.value = 'select'
  error.value = ''
  customerId.value = ''
  message.value = ''
  selected.value = new Set()
  results.value = []
  sentRecipient.value = null
  await refreshCustomers()
}

function seedProgressRows(ids: string[]) {
  results.value = ids.map((id) => {
    const inv = invoices.value.find(i => i.id === id)
    return {
      invoiceId: id,
      invoiceNumber: inv?.invoiceNumberFormatted ?? '',
      queueError: null,
      alreadyQueued: false,
      alreadySent: inv ? isInvoiceResend(inv.status) : false,
      state: 'pending' as const,
      stateError: null,
    }
  })
}

function applyQueueResults(apiResults: BulkApiResult[]) {
  for (const row of apiResults) {
    const target = results.value.find(r => r.invoiceId === row.invoiceId)
    if (!target) continue
    target.invoiceNumber = row.invoiceNumber || target.invoiceNumber
    target.alreadyQueued = row.alreadyQueued
    target.alreadySent = row.alreadySent
    if (row.error) {
      target.queueError = row.error
      target.state = 'failed'
      target.stateError = row.error
      continue
    }
    target.state = 'queued'
  }
}

function updateRow(invoiceId: string, patch: Partial<BulkResultRow>) {
  const row = results.value.find(r => r.invoiceId === invoiceId)
  if (row) Object.assign(row, patch)
}

function startPolling() {
  stopPolling()
  void pollStatuses()
  pollTimer = setInterval(() => { void pollStatuses() }, 2000)
}

async function pollStatuses() {
  const pending = results.value.filter(r =>
    !r.queueError && (r.state === 'queued' || r.state === 'processing'),
  )
  if (!pending.length) {
    stopPolling()
    if (progressSummary.value?.done) emit('sent')
    return
  }

  await Promise.all(pending.map(async (row) => {
    try {
      const data = await $fetch<{
        status: string
        delivery: { status: string, lastError: string | null, recipientEmail: string | null } | null
      }>(`/api/invoices/${row.invoiceId}/send-status`)

      const delivered = data.delivery?.status === 'done'
      const becameSent = !row.alreadySent && (data.status === 'sent' || data.status === 'paid')
      if (delivered || becameSent) {
        updateRow(row.invoiceId, { state: 'sent', stateError: null })
        return
      }
      if (data.delivery?.status === 'failed') {
        updateRow(row.invoiceId, {
          state: 'failed',
          stateError: data.delivery.lastError ?? 'Delivery failed',
        })
        return
      }
      if (data.delivery?.status === 'processing') {
        updateRow(row.invoiceId, { state: 'processing' })
      }
    }
    catch {
      // Transient poll error — keep trying.
    }
  }))
}

async function submit() {
  if (!customerId.value) {
    error.value = 'Select a customer.'
    return
  }
  if (!selected.value.size) {
    error.value = 'Select at least one invoice.'
    return
  }
  busy.value = true
  error.value = ''
  phase.value = 'progress'
  seedProgressRows([...selected.value])
  try {
    const data = await $fetch<{
      results: BulkApiResult[]
      recipient: { email: string } | null
    }>('/api/invoices/bulk-send', {
      method: 'POST',
      body: {
        customerId: customerId.value,
        invoiceIds: [...selected.value],
        message: message.value.trim() || undefined,
      },
    })
    applyQueueResults(data.results)
    sentRecipient.value = data.recipient?.email ?? recipientEmail.value
    startPolling()
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Bulk send failed'
    phase.value = 'select'
    results.value = []
  }
  finally {
    busy.value = false
  }
}

function rowStatusLabel(row: BulkResultRow): string {
  if (row.queueError) return row.queueError
  if (row.state === 'pending') return 'Queuing…'
  if (row.state === 'queued') return row.alreadyQueued ? 'In progress' : 'Queued'
  if (row.state === 'processing') return row.alreadySent ? 'Resending…' : 'Sending…'
  if (row.state === 'sent') return row.alreadySent ? 'Resent' : 'Sent'
  return row.stateError ?? 'Failed'
}

function rowStatusClass(row: BulkResultRow): string {
  if (row.state === 'sent') return 'pill ok'
  if (row.state === 'failed') return 'pill over'
  if (row.state === 'processing') return 'pill warn bulk-pill-live'
  if (row.state === 'queued') return 'pill warn bulk-pill-live'
  return 'pill gray bulk-pill-live'
}

onUnmounted(stopPolling)
</script>

<template>
  <button
    v-if="canSend"
    type="button"
    :class="buttonClass"
    :disabled="disabled"
    @click="openModal"
  >
    Bulk send
  </button>

  <Teleport to="body">
    <div v-if="open" class="modal-scrim open" @click.self="closeModal">
      <div class="card modal-card" style="max-width:640px; width:100%;">
        <div class="chead"><h3>Bulk send invoices</h3></div>
        <div class="cbody">
          <template v-if="phase === 'select'">
            <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
              Pick one customer, then select invoices to email. Already-sent invoices are included and will be resent.
              Each invoice is sent as its own email with a PDF attached.
            </p>

            <label class="fld">
              Customer
              <select v-model="customerId">
                <option value="" disabled>Select customer…</option>
                <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.displayName }}</option>
              </select>
              <span v-if="selectedCustomer" class="help">
                Emails to {{ recipientEmail ?? 'no billing email on file' }}
              </span>
            </label>

            <div v-if="customerId" class="bulk-list">
              <div class="bulk-list__head">
                <label class="bulk-check">
                  <input type="checkbox" :checked="allSelected" :disabled="!invoices.length" @change="toggleAll">
                  <span>Invoices ({{ invoices.length }})</span>
                </label>
                <span class="help" style="margin:0;">{{ selectedCount }} selected</span>
              </div>

              <div v-if="invoicesPending" class="cp-state">Loading invoices…</div>
              <div v-else-if="!invoices.length" class="empty" style="padding:18px;">
                No invoices available to send for this customer.
              </div>
              <ul v-else class="bulk-rows">
                <li v-for="inv in invoices" :key="inv.id">
                  <label class="bulk-check">
                    <input type="checkbox" :checked="selected.has(inv.id)" @change="toggle(inv.id)">
                    <span class="bulk-rows__num">{{ inv.invoiceNumberFormatted }}</span>
                    <span v-if="isInvoiceResend(inv.status)" class="pill sent bulk-sent-tag">Already sent</span>
                  </label>
                  <span class="bulk-rows__meta">
                    <span v-if="inv.dueDate">Due {{ invoiceDateDisplay(inv.dueDate) }}</span>
                    <b>{{ moneyDisplay(inv.total) }}</b>
                  </span>
                </li>
              </ul>
            </div>

            <label v-if="customerId && invoices.length" class="fld" style="margin-top:12px;">
              Message (optional, applied to all)
              <textarea v-model="message" rows="3" maxlength="5000" placeholder="Leave blank to use the default message." />
              <span class="help">Each subject uses its own invoice number. Portal link, total and footer are added automatically.</span>
            </label>

            <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button
                type="button"
                class="btn primary"
                :disabled="busy || !selectedCount"
                @click="submit"
              >
                Send {{ selectedCount || '' }} invoice{{ selectedCount === 1 ? '' : 's' }}
              </button>
              <button type="button" class="btn" :disabled="busy" @click="closeModal">Cancel</button>
            </div>
          </template>

          <template v-else>
            <div class="bulk-summary">
              <span v-if="progressSummary?.inFlight" class="spinner" aria-hidden="true" />
              <span v-else class="send-badge ok" aria-hidden="true">✓</span>
              <div>
                <p style="margin:0; font-weight:600;">{{ progressHeadline }}</p>
                <p class="help" style="margin:4px 0 0;">
                  <template v-if="sentRecipient">To {{ sentRecipient }}.</template>
                  <template v-if="progressSummary?.inFlight"> Delivery updates appear below as each invoice completes.</template>
                </p>
              </div>
            </div>

            <ul class="bulk-results">
              <li v-for="r in results" :key="r.invoiceId">
                <span class="bulk-rows__num">{{ r.invoiceNumber || '—' }}</span>
                <span :class="rowStatusClass(r)">{{ rowStatusLabel(r) }}</span>
              </li>
            </ul>

            <div style="display:flex; gap:8px; margin-top:12px;">
              <button
                type="button"
                class="btn primary"
                :disabled="!!progressSummary?.inFlight"
                @click="closeModal"
              >
                Done
              </button>
              <button
                v-if="progressSummary?.inFlight"
                type="button"
                class="btn"
                @click="closeModal"
              >
                Close
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bulk-list {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.bulk-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.bulk-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
}
.bulk-rows li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.bulk-rows li:last-child { border-bottom: none; }
.bulk-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
}
.bulk-rows__num { font-weight: 600; }
.bulk-sent-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
}
.bulk-rows__meta {
  display: flex;
  gap: 14px;
  align-items: center;
  font-size: 13px;
  color: #64748b;
}
.bulk-summary {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}
.bulk-results {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.bulk-results li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.bulk-results li:last-child { border-bottom: none; }
.bulk-pill-live {
  position: relative;
}
.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid #e2e8f0;
  border-top-color: #4f46e5;
  animation: bulk-spin 0.8s linear infinite;
  flex: none;
}
.send-badge {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 700;
  flex: none;
}
.send-badge.ok { background: #dcfce7; color: #16a34a; }
@keyframes bulk-spin {
  to { transform: rotate(360deg); }
}
</style>
