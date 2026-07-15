<script setup lang="ts">
// Record payment — amount, method, reference, notes (mockup: PAGE: RECORD PAYMENT / P1-25).
import {
  canRecordPaymentOnInvoice,
  parseInvoicePaymentHistory,
  PAYMENT_METHODS,
  projectedBalanceAfterPayment,
  validatePaymentAmount,
  willMarkFullyPaid,
  type PaymentMethod,
} from '~/utils/invoice-payment-ui'
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff', permission: 'invoices.record_payment.all' })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface InvoiceSummary {
  id: string
  invoiceNumberFormatted: string
  status: string
  customerName: string
  total: string
  amountPaid: string
  balanceDue: string
}

interface HistoryRow {
  id: string
  action: string
  actorName: string | null
  afterData: Record<string, unknown> | null
  createdAt: string
}

const route = useRoute()
const auth = useAuthStore()
const id = computed(() => String(route.params.id || ''))
const idValid = computed(() => UUID_RE.test(id.value))

const { data, error, pending, refresh } = useClientFetch<{
  invoice: InvoiceSummary
  history: HistoryRow[]
}>(() => (idValid.value ? `/api/invoices/${id.value}` : null), {
  immediate: false,
  watch: false,
})

function loadPaymentPage() {
  if (!import.meta.client) return
  if (!auth.loaded || !auth.can('invoices.record_payment.all')) return
  if (!idValid.value) return
  void refresh()
}

onMounted(() => {
  loadPaymentPage()
})

watch([() => auth.loaded, idValid], () => {
  loadPaymentPage()
})

const invoice = computed(() => data.value?.invoice)
const paymentHistory = computed(() =>
  parseInvoicePaymentHistory(data.value?.history ?? [], { sort: 'desc' }),
)
const hasPriorPayments = computed(() =>
  Number.parseFloat(invoice.value?.amountPaid ?? '0') > 0 || paymentHistory.value.length > 0,
)

const loadErrorMessage = computed(() => {
  if (!idValid.value) return 'This invoice link is invalid.'
  if (error.value) return syncFetchErrorMessage(error.value, 'Invoice not found or you do not have access.')
  return null
})

const canPay = computed(() =>
  invoice.value ? canRecordPaymentOnInvoice(invoice.value.status, invoice.value.balanceDue) : false,
)

const amount = ref('')
const paidDate = ref(new Date().toISOString().slice(0, 10))
const method = ref<PaymentMethod>('ach')
const reference = ref('')
const notes = ref('')

const busy = ref(false)
const submitError = ref('')

watch(invoice, (inv) => {
  if (inv && !amount.value) amount.value = inv.balanceDue
}, { immediate: true })

const amountError = computed(() =>
  invoice.value ? validatePaymentAmount(amount.value, invoice.value.balanceDue) : null,
)

const fullyPaid = computed(() =>
  invoice.value ? willMarkFullyPaid(invoice.value.balanceDue, amount.value) : false,
)

const projectedBalance = computed(() =>
  invoice.value ? projectedBalanceAfterPayment(invoice.value.balanceDue, amount.value) : '0.00',
)

function payFullBalance() {
  if (!invoice.value) return
  amount.value = invoice.value.balanceDue
}

async function submitPayment() {
  if (!invoice.value || !canPay.value) return
  const validation = validatePaymentAmount(amount.value, invoice.value.balanceDue)
  if (validation) {
    submitError.value = validation
    return
  }

  busy.value = true
  submitError.value = ''
  const isPartial = !fullyPaid.value
  try {
    await $fetch(`/api/invoices/${id.value}/mark-paid`, {
      method: 'POST',
      body: {
        paymentAmount: amount.value,
        paidAt: paidDate.value,
        method: method.value,
        reference: reference.value.trim() || undefined,
        notes: notes.value.trim() || undefined,
      },
    })
    await navigateTo({
      path: `/invoices/${id.value}`,
      query: {
        saved: 'payment',
        ...(isPartial ? { partial: '1' } : {}),
      },
    })
  }
  catch (e: unknown) {
    submitError.value = syncFetchErrorMessage(e, 'Could not record payment')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div v-if="!auth.loaded || (idValid && pending && !invoice && !loadErrorMessage)" class="cp-state">
      Loading invoice…
    </div>

    <div v-else-if="loadErrorMessage" class="card" style="padding:24px;">
      <p style="margin:0; color:#dc2626;">{{ loadErrorMessage }}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
        <button v-if="idValid" type="button" class="btn" @click="refresh()">Retry</button>
        <NuxtLink to="/invoices" class="btn">Back to invoices</NuxtLink>
      </div>
    </div>

    <template v-else-if="invoice">
      <div class="pagehead">
        <div>
          <h2>Record payment</h2>
          <p>
            <NuxtLink :to="`/invoices/${id}`">{{ invoice.invoiceNumberFormatted }}</NuxtLink>
            · {{ invoice.customerName }}
            · balance {{ moneyDisplay(invoice.balanceDue) }}
          </p>
        </div>
      </div>

      <div v-if="!canPay" class="card" style="margin-bottom:16px;">
        <div class="cbody">
          <template v-if="invoice.status === 'paid'">
            This invoice is already paid.
          </template>
          <template v-else-if="invoice.status !== 'sent'">
            Send the invoice before recording a payment (current status: {{ invoice.status }}).
          </template>
          <template v-else>
            No balance remains on this invoice.
          </template>
          <NuxtLink :to="`/invoices/${id}`" class="btn sm" style="margin-left:8px;">Back to invoice</NuxtLink>
        </div>
      </div>

      <div v-else class="cols">
        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Payment details</h3></div>
            <div class="cbody">
              <label class="fld">
                Amount
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                  <input
                    v-model="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    :max="invoice.balanceDue"
                    inputmode="decimal"
                    style="flex:1; min-width:140px;"
                  >
                  <button type="button" class="btn sm" @click="payFullBalance">
                    Pay full balance
                  </button>
                </div>
                <span class="help">Must not exceed the open balance of {{ moneyDisplay(invoice.balanceDue) }}</span>
                <span v-if="amountError" class="help" style="color:#dc2626;">{{ amountError }}</span>
              </label>
              <label class="fld">
                Payment date
                <input v-model="paidDate" type="date" required>
              </label>
              <label class="fld">
                Method
                <select v-model="method">
                  <option v-for="m in PAYMENT_METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
              </label>
              <label class="fld">
                Reference / check #
                <input v-model="reference" type="text" placeholder="e.g. ACH-88421 or check 1042">
              </label>
              <label class="fld">
                Notes
                <textarea v-model="notes" placeholder="Optional internal note" rows="3" />
              </label>
              <p v-if="submitError" class="help" style="color:#dc2626;">{{ submitError }}</p>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button type="button" class="btn primary" :disabled="busy || Boolean(amountError)" @click="submitPayment">
                  {{ fullyPaid ? 'Record payment & mark paid' : 'Record partial payment' }}
                </button>
                <NuxtLink :to="`/invoices/${id}`" class="btn">Cancel</NuxtLink>
              </div>
            </div>
          </div>

          <div v-if="hasPriorPayments" class="card">
            <div class="chead"><h3>Prior payments</h3></div>
            <div class="tscroll">
              <table class="tbl">
                <thead>
                  <tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr>
                </thead>
                <tbody>
                  <tr v-for="payment in paymentHistory" :key="payment.id">
                    <td>{{ invoiceDateDisplay(payment.date.slice(0, 10)) }}</td>
                    <td>{{ payment.method }}</td>
                    <td class="mono">{{ payment.reference }}</td>
                    <td class="num">{{ moneyDisplay(payment.amount) }}</td>
                  </tr>
                  <tr v-if="!paymentHistory.length">
                    <td colspan="4" class="empty" style="display:table-cell;">
                      {{ moneyDisplay(invoice.amountPaid) }} previously recorded on this invoice.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="chead"><h3>Invoice summary</h3></div>
            <dl class="kv">
              <dt>Invoice</dt><dd>{{ invoice.invoiceNumberFormatted }}</dd>
              <dt>Total</dt><dd>{{ moneyDisplay(invoice.total) }}</dd>
              <dt>Previously paid</dt><dd>{{ moneyDisplay(invoice.amountPaid) }}</dd>
              <dt>Current balance</dt>
              <dd style="color:#4f46e5; font-size:16px">{{ moneyDisplay(invoice.balanceDue) }}</dd>
              <template v-if="amount && !amountError">
                <dt>This payment</dt><dd>−{{ moneyDisplay(amount) }}</dd>
                <dt>Balance after</dt>
                <dd :style="{ color: fullyPaid ? '#059669' : '#4f46e5', fontSize: '16px', fontWeight: 700 }">
                  {{ moneyDisplay(projectedBalance) }}
                </dd>
              </template>
            </dl>
          </div>
          <div class="card">
            <div class="chead"><h3>After recording</h3></div>
            <div class="cbody" style="font-size:13px; color:#64748b; line-height:1.55;">
              <template v-if="fullyPaid">
                Status updates to <b>Paid</b> when this payment is recorded.
              </template>
              <template v-else>
                Partial payments keep the invoice <b>Sent</b> until the balance reaches $0.
                You can record additional payments from the invoice detail page.
              </template>
              An audit entry is written with method and reference. Customer portal reflects payment immediately.
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="cp-state">Invoice not found.</div>
  </section>
</template>
