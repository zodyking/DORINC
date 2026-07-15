<script setup lang="ts">
// Customer portal invoice detail — line items + PDF download (mockup: Portal Invoice detail / P2-05).
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'
import {
  portalInvoiceDetailStatus,
  portalInvoicePdfUrl,
} from '~/utils/portal-invoices-ui'
import { vehicleSub, vehicleTag, type VehicleDisplay } from '~/utils/vehicles-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const id = computed(() => route.params.id as string)

interface PortalInvoiceDetail {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  amountPaid: string
  vehicleLabel: string
  vehicle: VehicleDisplay | null
  lineItems: Array<{
    id: string
    description: string
    quantity: string
    lineAmount: string
    lineType: string
  }>
}

const { data: invoice, error, pending } = useClientFetch<PortalInvoiceDetail>(
  () => `/api/portal/invoices/${id.value}`,
  { watch: [id] },
)

const statusPill = computed(() => {
  if (!invoice.value) return { cls: 'pill gray', label: '—' }
  return portalInvoiceDetailStatus(
    invoice.value.status,
    invoice.value.dueDate,
    invoice.value.balanceDue,
  )
})

const vehicleLine = computed(() => {
  if (!invoice.value?.vehicle) return invoice.value?.vehicleLabel ?? '—'
  return `${vehicleTag(invoice.value.vehicle)} — ${vehicleSub(invoice.value.vehicle)}`
})

function downloadPdf() {
  window.location.href = portalInvoicePdfUrl(id.value)
}
</script>

<template>
  <section v-if="pending && !invoice" class="page active">
    <div class="empty">Loading invoice…</div>
  </section>

  <section v-else-if="error" class="page active">
    <div class="empty">Invoice not found or you do not have access.</div>
  </section>

  <section v-else-if="invoice" class="page active">
    <div class="pagehead">
      <div>
        <h2>{{ invoice.invoiceNumberFormatted }}</h2>
        <p>
          <NuxtLink to="/portal/invoices">← Invoices</NuxtLink>
          · {{ invoice.vehicleLabel }}
          · issued {{ invoiceDateDisplay(invoice.invoiceDate) }}
        </p>
      </div>
      <div class="actions">
        <button type="button" class="btn dl-pdf" @click="downloadPdf">Download PDF</button>
      </div>
    </div>

    <div class="cols">
      <div class="card">
        <div class="chead">
          <h3>Summary</h3>
          <span :class="statusPill.cls">{{ statusPill.label }}</span>
        </div>
        <dl class="kv">
          <dt>Vehicle</dt>
          <dd>{{ vehicleLine }}</dd>
          <dt>Due date</dt>
          <dd>{{ invoiceDateDisplay(invoice.dueDate) }}</dd>
          <dt>Total</dt>
          <dd>{{ moneyDisplay(invoice.total) }}</dd>
          <dt>Balance</dt>
          <dd style="color:#4f46e5;font-weight:700;">{{ moneyDisplay(invoice.balanceDue) }}</dd>
        </dl>
      </div>

      <div class="card">
        <div class="chead"><h3>Line items</h3></div>
        <div class="tscroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Description</th>
                <th class="num">Qty</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in (invoice.lineItems ?? [])" :key="line.id">
                <td><span class="lead">{{ line.description }}</span></td>
                <td class="num">{{ line.quantity }}</td>
                <td class="num">{{ moneyDisplay(line.lineAmount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
