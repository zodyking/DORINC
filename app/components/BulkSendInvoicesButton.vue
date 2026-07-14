<script setup lang="ts">
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'

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
  total: string
  dueDate: string | null
}

interface BulkResult {
  invoiceId: string
  invoiceNumber: string
  queued: boolean
  alreadyQueued: boolean
  error: string | null
}

type Phase = 'select' | 'sending' | 'results'

const open = ref(false)
const phase = ref<Phase>('select')
const error = ref('')

const customerId = ref('')
const message = ref('')
const selected = ref<Set<string>>(new Set())
const busy = ref(false)

const results = ref<BulkResult[]>([])
const summary = ref<{ requested: number, queued: number, alreadyQueued: number, failed: number } | null>(null)
const sentRecipient = ref<string | null>(null)

const {
  data: customersData,
  refresh: refreshCustomers,
} = useFetch<{ items: CustomerPick[] }>('/api/customers', {
  key: 'bulk-send-customers',
  query: { pageSize: 200, sort: 'name-asc' },
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
    status: 'approved',
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

watch(customerId, () => {
  selected.value = new Set()
  if (customerId.value) void refreshInvoices()
})

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(invoices.value.map(i => i.id))
}

async function openModal() {
  open.value = true
  phase.value = 'select'
  error.value = ''
  customerId.value = ''
  message.value = ''
  selected.value = new Set()
  results.value = []
  summary.value = null
  sentRecipient.value = null
  await refreshCustomers()
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
  phase.value = 'sending'
  try {
    const data = await $fetch<{
      results: BulkResult[]
      recipient: { email: string } | null
      summary: { requested: number, queued: number, alreadyQueued: number, failed: number }
    }>('/api/invoices/bulk-send', {
      method: 'POST',
      body: {
        customerId: customerId.value,
        invoiceIds: [...selected.value],
        message: message.value.trim() || undefined,
      },
    })
    results.value = data.results
    summary.value = data.summary
    sentRecipient.value = data.recipient?.email ?? recipientEmail.value
    phase.value = 'results'
    emit('sent')
  }
  catch (e: unknown) {
    const err = e as { data?: { message?: string, data?: { message?: string } } }
    error.value = err.data?.data?.message ?? err.data?.message ?? 'Bulk send failed'
    phase.value = 'select'
  }
  finally {
    busy.value = false
  }
}
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
    <div v-if="open" class="modal-scrim open" @click.self="open = false">
      <div class="card modal-card" style="max-width:640px; width:100%;">
        <div class="chead"><h3>Bulk send invoices</h3></div>
        <div class="cbody">
          <template v-if="phase === 'select'">
            <p style="font-size:13px; color:#64748b; margin:0 0 14px;">
              Pick one customer, then select the approved invoices to email. Each invoice is sent as its own
              email with a PDF attached.
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
                  <span>Approved invoices ({{ invoices.length }})</span>
                </label>
                <span class="help" style="margin:0;">{{ selectedCount }} selected</span>
              </div>

              <div v-if="invoicesPending" class="cp-state">Loading invoices…</div>
              <div v-else-if="!invoices.length" class="empty" style="padding:18px;">
                No approved invoices ready to send for this customer.
              </div>
              <ul v-else class="bulk-rows">
                <li v-for="inv in invoices" :key="inv.id">
                  <label class="bulk-check">
                    <input type="checkbox" :checked="selected.has(inv.id)" @change="toggle(inv.id)">
                    <span class="bulk-rows__num">{{ inv.invoiceNumberFormatted }}</span>
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
              <button type="button" class="btn" :disabled="busy" @click="open = false">Cancel</button>
            </div>
          </template>

          <template v-else-if="phase === 'sending'">
            <div class="send-status">
              <div class="spinner" aria-hidden="true" />
              <p style="margin:0; font-weight:600;">Queuing invoices…</p>
              <p class="help" style="margin:6px 0 0;">Emailing {{ recipientEmail }}.</p>
            </div>
          </template>

          <template v-else>
            <div v-if="summary" class="bulk-summary">
              <span class="send-badge ok" aria-hidden="true">✓</span>
              <div>
                <p style="margin:0; font-weight:600;">
                  {{ summary.queued }} of {{ summary.requested }} invoice{{ summary.requested === 1 ? '' : 's' }} queued
                </p>
                <p class="help" style="margin:4px 0 0;">
                  Sent to {{ sentRecipient ?? 'customer' }}.
                  <template v-if="summary.alreadyQueued"> {{ summary.alreadyQueued }} already in progress.</template>
                  <template v-if="summary.failed"> {{ summary.failed }} could not be queued.</template>
                </p>
              </div>
            </div>

            <ul class="bulk-results">
              <li v-for="r in results" :key="r.invoiceId">
                <span class="bulk-rows__num">{{ r.invoiceNumber || '—' }}</span>
                <span v-if="r.error" class="pill over">{{ r.error }}</span>
                <span v-else-if="r.alreadyQueued" class="pill warn">Already queued</span>
                <span v-else class="pill ok">Queued</span>
              </li>
            </ul>

            <div style="display:flex; gap:8px; margin-top:12px;">
              <button type="button" class="btn primary" @click="open = false">Done</button>
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
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.bulk-results li:last-child { border-bottom: none; }
.send-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 22px 8px;
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
.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid #e2e8f0;
  border-top-color: #4f46e5;
  animation: bulk-spin 0.8s linear infinite;
  margin-bottom: 12px;
}
@keyframes bulk-spin {
  to { transform: rotate(360deg); }
}
</style>
