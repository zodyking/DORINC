<script setup lang="ts">
import { invoiceDateDisplay, moneyDisplay, paymentTermsLabel } from '~/utils/invoices-ui'
import {
  portalInvoiceDetailStatus,
  portalInvoicePdfUrl,
} from '~/utils/portal-invoices-ui'
import { odoDisplay, unitTypeLabel, type VehicleDisplay } from '~/utils/vehicles-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const id = computed(() => route.params.id as string)

interface PortalVehicleDetail extends VehicleDisplay {
  vin?: string | null
  plate?: string | null
  odometer?: string | null
  odometerUnit?: string
}

interface PortalInvoiceDetail {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string
  dueDate: string | null
  total: string
  subtotal: string
  taxAmount: string
  discountAmount: string
  feesAmount: string
  balanceDue: string
  amountPaid: string
  paymentTerms: string
  poNumber: string | null
  serviceLocation: string | null
  customerNotes: string | null
  complaint: string | null
  paidAt: string | null
  sentAt: string | null
  vehicleLabel: string
  vehicle: PortalVehicleDetail | null
  lineItems: Array<{
    id: string
    description: string
    quantity: string
    unitPrice: string
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

function vehicleUnitNumber(vehicle: PortalVehicleDetail | null): string {
  if (!vehicle) return '—'
  if (vehicle.busNumber) return `#${vehicle.busNumber}`
  if (vehicle.unitTag) return vehicle.unitTag
  return '—'
}

const correctionOpen = ref(false)
const correctionLine = ref<PortalInvoiceDetail['lineItems'][number] | null>(null)

function openCorrection(line: PortalInvoiceDetail['lineItems'][number]) {
  correctionLine.value = line
  correctionOpen.value = true
}

function downloadPdf() {
  window.location.href = portalInvoicePdfUrl(id.value)
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <section v-if="pending && !invoice" class="page active portal-page">
    <div class="card">
      <div class="empty">Loading invoice…</div>
    </div>
  </section>

  <section v-else-if="error" class="page active portal-page">
    <div class="card">
      <div class="empty">Invoice not found or you do not have access.</div>
    </div>
  </section>

  <section v-else-if="invoice" class="page active portal-page portal-invoice-detail">
    <PortalPageHead>
      <template #title>
        {{ invoice.invoiceNumberFormatted }}
        <span :class="statusPill.cls" style="vertical-align:3px;margin-left:8px;">{{ statusPill.label }}</span>
      </template>
      <template #subtitle>
        <NuxtLink to="/portal/invoices">← Invoices</NuxtLink>
        · {{ invoice.vehicleLabel }}
        · issued {{ invoiceDateDisplay(invoice.invoiceDate) }}
      </template>
      <template #actions>
        <button type="button" class="btn" @click="downloadPdf">Download PDF</button>
      </template>
    </PortalPageHead>

    <div class="inv-meta">
      <div class="inv-meta__item">
        <span class="inv-meta__label">Invoice date</span>
        <span class="inv-meta__value">{{ invoiceDateDisplay(invoice.invoiceDate) }}</span>
      </div>
      <div class="inv-meta__item">
        <span class="inv-meta__label">Due</span>
        <span class="inv-meta__value">{{ invoiceDateDisplay(invoice.dueDate) }}</span>
      </div>
      <div class="inv-meta__item">
        <span class="inv-meta__label">Terms</span>
        <span class="inv-meta__value">{{ paymentTermsLabel(invoice.paymentTerms) }}</span>
      </div>
      <div class="inv-meta__item">
        <span class="inv-meta__label">Balance due</span>
        <span class="inv-meta__value strong">{{ moneyDisplay(invoice.balanceDue) }}</span>
      </div>
    </div>

    <div class="stack">
      <div class="card">
        <div class="chead"><h3>Invoice &amp; vehicle</h3></div>
        <div class="detail-grid">
          <div class="detail-field">
            <span class="detail-field__label">Status</span>
            <span class="detail-field__value"><span :class="statusPill.cls">{{ statusPill.label }}</span></span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Total</span>
            <span class="detail-field__value">{{ moneyDisplay(invoice.total) }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Amount paid</span>
            <span class="detail-field__value">{{ moneyDisplay(invoice.amountPaid) }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Subtotal</span>
            <span class="detail-field__value">{{ moneyDisplay(invoice.subtotal) }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Tax</span>
            <span class="detail-field__value">{{ moneyDisplay(invoice.taxAmount) }}</span>
          </div>
          <div v-if="Number.parseFloat(invoice.discountAmount) > 0" class="detail-field">
            <span class="detail-field__label">Discount</span>
            <span class="detail-field__value">{{ moneyDisplay(invoice.discountAmount) }}</span>
          </div>
          <div v-if="Number.parseFloat(invoice.feesAmount) > 0" class="detail-field">
            <span class="detail-field__label">Fees</span>
            <span class="detail-field__value">{{ moneyDisplay(invoice.feesAmount) }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">PO number</span>
            <span class="detail-field__value">{{ invoice.poNumber || '—' }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Service location</span>
            <span class="detail-field__value">{{ invoice.serviceLocation || '—' }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Sent</span>
            <span class="detail-field__value">{{ formatTimestamp(invoice.sentAt) }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Paid</span>
            <span class="detail-field__value">{{ formatTimestamp(invoice.paidAt) }}</span>
          </div>

          <div class="detail-field">
            <span class="detail-field__label">Unit type</span>
            <span class="detail-field__value">{{ invoice.vehicle ? unitTypeLabel(invoice.vehicle.unitType) : '—' }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Unit #</span>
            <span class="detail-field__value">{{ vehicleUnitNumber(invoice.vehicle) }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Year</span>
            <span class="detail-field__value">{{ invoice.vehicle?.year ?? '—' }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Make</span>
            <span class="detail-field__value">{{ invoice.vehicle?.make || '—' }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Model</span>
            <span class="detail-field__value">{{ invoice.vehicle?.model || '—' }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">VIN</span>
            <span class="detail-field__value mono">{{ invoice.vehicle?.vin || '—' }}</span>
          </div>
          <div class="detail-field">
            <span class="detail-field__label">Plate</span>
            <span class="detail-field__value">{{ invoice.vehicle?.plate || '—' }}</span>
          </div>
          <div v-if="invoice.vehicle?.odometer" class="detail-field">
            <span class="detail-field__label">Odometer</span>
            <span class="detail-field__value">
              {{ odoDisplay(invoice.vehicle.odometer, invoice.vehicle.odometerUnit ?? 'mi') }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="invoice.complaint || invoice.customerNotes" class="card">
        <div class="chead"><h3>Symptoms &amp; complaints</h3></div>
        <div class="cbody">
          <p v-if="invoice.complaint" style="margin:0 0 12px;">{{ invoice.complaint }}</p>
          <p v-if="invoice.customerNotes" class="help" style="margin:0;">{{ invoice.customerNotes }}</p>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>Line items</h3></div>
        <div class="tscroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Description</th>
                <th class="num">Qty</th>
                <th class="num">Rate</th>
                <th class="num">Amount</th>
                <th class="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in (invoice.lineItems ?? [])" :key="line.id">
                <td><span class="lead">{{ line.description }}</span></td>
                <td class="num">{{ line.quantity }}</td>
                <td class="num">{{ moneyDisplay(line.unitPrice) }}</td>
                <td class="num">{{ moneyDisplay(line.lineAmount) }}</td>
                <td class="col-actions">
                  <button type="button" class="btn sm" @click="openCorrection(line)">
                    Request correction
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <PortalInvoiceLineCorrectionModal
      v-model:open="correctionOpen"
      :invoice-id="invoice.id"
      :invoice-number-formatted="invoice.invoiceNumberFormatted"
      :line="correctionLine"
    />
  </section>
</template>

<style scoped>
.inv-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
  padding: 14px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
}
.inv-meta__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inv-meta__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.inv-meta__value {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.inv-meta__value.strong {
  color: #4f46e5;
}
.portal-invoice-detail .stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.portal-invoice-detail .detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px 20px;
  padding: 0 18px 18px;
}
.portal-invoice-detail .detail-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.portal-invoice-detail .detail-field__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.portal-invoice-detail .detail-field__value {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  overflow-wrap: anywhere;
}
.portal-invoice-detail .col-actions {
  width: 160px;
  text-align: right;
  vertical-align: middle;
}
</style>
