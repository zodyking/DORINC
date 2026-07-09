<script setup lang="ts">
// Record payment — amount, method, reference, notes (mockup: PAGE: RECORD PAYMENT / P1-25).
import {
  canRecordPaymentOnInvoice,
  PAYMENT_METHODS,
  validatePaymentAmount,
  willMarkFullyPaid,
  type PaymentMethod,
} from '~/utils/invoice-payment-ui'
import { moneyDisplay } from '~/utils/invoices-ui'

definePageMeta({ layout: 'staff' })

interface InvoiceSummary {
  id: string
  invoiceNumberFormatted: string
  status: string
  customerName: string
  total: string
  amountPaid: string
  balanceDue: string
}

const route = useRoute()
const auth = useAuthStore()
const id = route.params.id as string

if (import.meta.client && auth.loaded && !auth.can('invoices.record_payment.all')) {
  navigateTo(`/invoices/${id}`)
}

const { data, error } = await useFetch<{ invoice: InvoiceSummary }>(`/api/invoices/${id}`)

const invoice = computed(() => data.value?.invoice)
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

async function submitPayment() {
  if (!invoice.value || !canPay.value) return
  const validation = validatePaymentAmount(amount.value, invoice.value.balanceDue)
  if (validation) {
    submitError.value = validation
    return
  }

  busy.value = true
  submitError.value = ''
  try {
    await $fetch(`/api/invoices/${id}/mark-paid`, {
      method: 'POST',
      body: {
        paymentAmount: amount.value,
        paidAt: paidDate.value,
        method: method.value,
        reference: reference.value.trim() || undefined,
        notes: notes.value.trim() || undefined,
      },
    })
    await navigateTo(`/invoices/${id}`)
  }
  catch (e: unknown) {
    submitError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not record payment'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:24px;">
      <p>Invoice not found.</p>
      <NuxtLink to="/invoices" class="btn">Back to invoices</NuxtLink>
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
        <div class="card">
          <div class="chead"><h3>Payment details</h3></div>
          <div class="cbody">
            <label class="fld">
              Amount
              <input
                v-model="amount"
                type="number"
                step="0.01"
                min="0"
                :max="invoice.balanceDue"
                inputmode="decimal"
              >
              <span class="help">Must not exceed the open balance</span>
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
                Record payment
              </button>
              <NuxtLink :to="`/invoices/${id}`" class="btn">Cancel</NuxtLink>
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
              <dt>Balance due</dt>
              <dd style="color:#4f46e5; font-size:16px">{{ moneyDisplay(invoice.balanceDue) }}</dd>
            </dl>
          </div>
          <div class="card">
            <div class="chead"><h3>After recording</h3></div>
            <div class="cbody" style="font-size:13px; color:#64748b; line-height:1.55;">
              Status updates to <b>Paid</b> when balance reaches $0.
              <template v-if="!fullyPaid"> Partial payments keep the invoice <b>Sent</b> until fully paid.</template>
              An audit entry is written. Customer portal reflects payment immediately. No PDF regeneration needed.
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
