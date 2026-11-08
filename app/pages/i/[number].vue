<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { invoiceDateDisplay, moneyDisplay, paymentTermsLabel } from '~/utils/invoices-ui'
import { previewLineGrossAmount } from '~/utils/invoice-creator-ui'
import InvoicePriceStack from '~/components/invoices/InvoicePriceStack.vue'
import { portalInvoiceDetailStatus } from '~/utils/portal-invoices-ui'
import { odoDisplay, type VehicleDisplay } from '~/utils/vehicles-ui'
import {
  PORTAL_BILLING_TOPICS,
  PORTAL_SERVICE_CATEGORIES,
  PORTAL_SERVICE_URGENCIES,
} from '~/utils/portal-requests-ui'

definePageMeta({
  layout: false,
})

const route = useRoute()
const number = computed(() => String(route.params.number ?? ''))

interface PublicVehicle extends VehicleDisplay {
  vin?: string | null
  plate?: string | null
  odometer?: string | null
  odometerUnit?: string
}

interface PublicInvoicePage {
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
  vehicleId: string | null
  vehicleLabel: string
  vehicle: PublicVehicle | null
  customerName: string
  customerEmail: string | null
  hasPdf: boolean
  company: {
    businessName: string
    email: string
    phone: string
  }
  lineItems: Array<{
    id: string
    description: string
    quantity: string
    unitPrice: string
    lineAmount: string
    lineType: string
  }>
}

const { data: invoice, error, pending } = useClientFetch<PublicInvoicePage>(
  () => `/api/public/invoices/${encodeURIComponent(number.value)}`,
  { watch: [number] },
)

const displayBusinessName = computed(() => invoice.value?.company.businessName?.trim() || BRAND_NAME)

useHead(() => ({
  title: invoice.value
    ? `${invoice.value.invoiceNumberFormatted} · ${displayBusinessName.value}`
    : `Invoice · ${BRAND_NAME}`,
}))

const statusPill = computed(() => {
  if (!invoice.value) return { cls: 'pill gray', label: '—' }
  return portalInvoiceDetailStatus(
    invoice.value.status,
    invoice.value.dueDate,
    invoice.value.balanceDue,
  )
})

const changeUrl = computed(() => `/api/public/invoices/${encodeURIComponent(number.value)}/change-requests`)

function vehicleUnitNumber(vehicle: PublicVehicle | null): string {
  if (!vehicle) return '—'
  if (vehicle.busNumber) return `#${vehicle.busNumber}`
  if (vehicle.unitTag) return vehicle.unitTag
  return '—'
}

function timestampDisplay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const correctionOpen = ref(false)
const correctionLine = ref<PublicInvoicePage['lineItems'][number] | null>(null)
const vehicleCorrectionOpen = ref(false)

function openCorrection(line: PublicInvoicePage['lineItems'][number]) {
  correctionLine.value = line
  correctionOpen.value = true
}

function downloadPdf() {
  window.location.href = `/api/public/invoices/${encodeURIComponent(number.value)}/pdf`
}

const serviceForm = reactive({
  serviceCategory: PORTAL_SERVICE_CATEGORIES[0] as string,
  urgency: 'normal',
  preferredDate: '',
  location: '',
  description: '',
})
const serviceBusy = ref(false)
const serviceMessage = ref('')
const serviceError = ref('')

const billingForm = reactive({
  topic: PORTAL_BILLING_TOPICS[0] as string,
  description: '',
})
const billingBusy = ref(false)
const billingMessage = ref('')
const billingError = ref('')

async function submitService() {
  serviceBusy.value = true
  serviceMessage.value = ''
  serviceError.value = ''
  try {
    await $fetch(`/api/public/invoices/${encodeURIComponent(number.value)}/service-requests`, {
      method: 'POST',
      body: {
        serviceCategory: serviceForm.serviceCategory,
        urgency: serviceForm.urgency,
        preferredDate: serviceForm.preferredDate || null,
        location: serviceForm.location || null,
        description: serviceForm.description,
      },
    })
    serviceMessage.value = 'Request sent. The shop will follow up.'
    serviceForm.description = ''
  }
  catch (err: unknown) {
    const fe = err as { data?: { message?: string } }
    serviceError.value = fe.data?.message ?? 'Unable to send this request.'
  }
  finally {
    serviceBusy.value = false
  }
}

async function submitBilling() {
  billingBusy.value = true
  billingMessage.value = ''
  billingError.value = ''
  try {
    await $fetch(changeUrl.value, {
      method: 'POST',
      body: {
        topic: billingForm.topic,
        description: billingForm.description,
      },
    })
    billingMessage.value = 'Message sent. Accounting will follow up.'
    billingForm.description = ''
  }
  catch (err: unknown) {
    const fe = err as { data?: { message?: string } }
    billingError.value = fe.data?.message ?? 'Unable to send this message.'
  }
  finally {
    billingBusy.value = false
  }
}
</script>

<template>
  <div class="oa">
    <header class="oa-top">
      <div class="oa-brand">
        <img class="oa-logo" :src="BRAND_ICON" alt="" width="40" height="40">
        <div>
          <strong>{{ displayBusinessName }}</strong>
          <small>Online Access</small>
        </div>
      </div>
      <a v-if="invoice?.company.email" class="oa-mail" :href="`mailto:${invoice.company.email}`">
        {{ invoice.company.email }}
      </a>
    </header>

    <main class="oa-main">
      <section v-if="pending && !invoice" class="oa-card oa-empty">Loading invoice…</section>

      <section v-else-if="error" class="oa-card oa-empty">
        This invoice is not available online.
      </section>

      <template v-else-if="invoice">
        <section class="oa-hero">
          <div>
            <p class="oa-kicker">Invoice</p>
            <h1>
              {{ invoice.invoiceNumberFormatted }}
              <span :class="statusPill.cls">{{ statusPill.label }}</span>
            </h1>
            <p class="oa-sub">
              {{ invoice.customerName }}
              <template v-if="invoice.vehicleLabel && invoice.vehicleLabel !== '—'">
                · {{ invoice.vehicleLabel }}
              </template>
            </p>
          </div>
          <button
            v-if="invoice.hasPdf"
            type="button"
            class="btn primary"
            @click="downloadPdf"
          >
            Download PDF
          </button>
        </section>

        <section class="oa-pay" aria-label="Payment record">
          <div>
            <span>Total</span>
            <b>{{ moneyDisplay(invoice.total) }}</b>
          </div>
          <div>
            <span>Amount paid</span>
            <b>{{ moneyDisplay(invoice.amountPaid) }}</b>
          </div>
          <div>
            <span>Paid on</span>
            <b>{{ timestampDisplay(invoice.paidAt) }}</b>
          </div>
          <div class="oa-pay-due">
            <span>Balance due</span>
            <b>{{ moneyDisplay(invoice.balanceDue) }}</b>
          </div>
        </section>

        <section class="oa-grid">
          <article class="oa-card">
            <h2>Invoice details</h2>
            <dl class="oa-kv">
              <dt>Date</dt>
              <dd>{{ invoiceDateDisplay(invoice.invoiceDate) }}</dd>
              <dt>Due</dt>
              <dd>{{ invoiceDateDisplay(invoice.dueDate) }}</dd>
              <dt>Terms</dt>
              <dd>{{ paymentTermsLabel(invoice.paymentTerms) }}</dd>
              <dt>PO number</dt>
              <dd>{{ invoice.poNumber || '—' }}</dd>
              <dt>Service location</dt>
              <dd>{{ invoice.serviceLocation || '—' }}</dd>
            </dl>
          </article>

          <article class="oa-card">
            <div class="oa-card-head">
              <h2>Vehicle</h2>
              <button
                v-if="invoice.vehicle"
                type="button"
                class="btn sm"
                @click="vehicleCorrectionOpen = true"
              >
                Request change
              </button>
            </div>
            <dl v-if="invoice.vehicle" class="oa-kv">
              <dt>Unit #</dt>
              <dd>{{ vehicleUnitNumber(invoice.vehicle) }}</dd>
              <dt>Year</dt>
              <dd>{{ invoice.vehicle.year ?? '—' }}</dd>
              <dt>Make</dt>
              <dd>{{ invoice.vehicle.make || '—' }}</dd>
              <dt>Model</dt>
              <dd>{{ invoice.vehicle.model || '—' }}</dd>
              <dt>VIN</dt>
              <dd class="mono">{{ invoice.vehicle.vin || '—' }}</dd>
              <dt>Plate</dt>
              <dd>{{ invoice.vehicle.plate || '—' }}</dd>
              <template v-if="invoice.vehicle.odometer">
                <dt>Odometer</dt>
                <dd>{{ odoDisplay(invoice.vehicle.odometer, invoice.vehicle.odometerUnit ?? 'mi') }}</dd>
              </template>
            </dl>
            <p v-else class="oa-muted">No vehicle on this invoice.</p>
          </article>
        </section>

        <section v-if="invoice.complaint || invoice.customerNotes" class="oa-card">
          <h2>Symptoms / complaints</h2>
          <p v-if="invoice.complaint">{{ invoice.complaint }}</p>
          <p v-if="invoice.customerNotes" class="oa-muted">{{ invoice.customerNotes }}</p>
        </section>

        <section class="oa-card">
          <h2>Line items</h2>
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
                <tr v-for="line in invoice.lineItems" :key="line.id">
                  <td><span class="lead">{{ line.description }}</span></td>
                  <td class="num">{{ line.quantity }}</td>
                  <td class="num">{{ moneyDisplay(line.unitPrice) }}</td>
                  <td class="num">
                    <InvoicePriceStack
                      :original="previewLineGrossAmount(line.quantity, line.unitPrice) || line.lineAmount"
                      :current="line.lineAmount"
                    />
                  </td>
                  <td class="col-actions">
                    <button type="button" class="btn sm" @click="openCorrection(line)">
                      Request change
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="oa-grid">
          <article v-if="invoice.vehicleId" class="oa-card">
            <h2>Request service</h2>
            <p class="oa-help">Ask the shop to schedule work on this unit.</p>
            <form class="oa-form" @submit.prevent="submitService">
              <label>
                Category
                <select v-model="serviceForm.serviceCategory">
                  <option v-for="cat in PORTAL_SERVICE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </label>
              <label>
                Urgency
                <select v-model="serviceForm.urgency">
                  <option v-for="u in PORTAL_SERVICE_URGENCIES" :key="u.value" :value="u.value">{{ u.label }}</option>
                </select>
              </label>
              <label>
                Preferred date
                <input v-model="serviceForm.preferredDate" type="date">
              </label>
              <label>
                Location
                <input v-model="serviceForm.location" type="text" maxlength="200">
              </label>
              <label class="oa-span">
                What needs to be done?
                <textarea v-model="serviceForm.description" required rows="4" maxlength="4000" />
              </label>
              <p v-if="serviceMessage" class="oa-ok">{{ serviceMessage }}</p>
              <p v-else-if="serviceError" class="oa-err">{{ serviceError }}</p>
              <button type="submit" class="btn primary" :disabled="serviceBusy">
                {{ serviceBusy ? 'Sending…' : 'Send service request' }}
              </button>
            </form>
          </article>

          <article class="oa-card">
            <h2>Billing question</h2>
            <p class="oa-help">
              Email {{ invoice.company.email || 'the shop' }} or send a note from here.
            </p>
            <form class="oa-form" @submit.prevent="submitBilling">
              <label>
                Topic
                <select v-model="billingForm.topic">
                  <option v-for="topic in PORTAL_BILLING_TOPICS" :key="topic" :value="topic">{{ topic }}</option>
                </select>
              </label>
              <label class="oa-span">
                Message
                <textarea v-model="billingForm.description" required rows="4" maxlength="4000" />
              </label>
              <p v-if="billingMessage" class="oa-ok">{{ billingMessage }}</p>
              <p v-else-if="billingError" class="oa-err">{{ billingError }}</p>
              <button type="submit" class="btn primary" :disabled="billingBusy">
                {{ billingBusy ? 'Sending…' : 'Send message' }}
              </button>
            </form>
          </article>
        </section>
      </template>
    </main>

    <footer class="oa-foot">© 2015 {{ BRAND_NAME }}. All rights reserved.</footer>

    <PortalInvoiceLineCorrectionModal
      v-if="invoice"
      v-model:open="correctionOpen"
      :invoice-id="invoice.id"
      :invoice-number-formatted="invoice.invoiceNumberFormatted"
      :submit-url="changeUrl"
      :line="correctionLine"
    />

    <PortalInvoiceVehicleCorrectionModal
      v-if="invoice"
      v-model:open="vehicleCorrectionOpen"
      :invoice-id="invoice.id"
      :invoice-number-formatted="invoice.invoiceNumberFormatted"
      :submit-url="changeUrl"
      :vehicle="invoice.vehicle"
    />
  </div>
</template>

<style scoped>
.oa {
  min-height: 100vh;
  background:
    radial-gradient(1200px 400px at 10% -10%, #eef2ff 0%, transparent 55%),
    #f8fafc;
  color: #0f172a;
}
.oa-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1080px;
  margin: 0 auto;
  padding: 22px 20px 8px;
}
.oa-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.oa-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.oa-brand strong {
  display: block;
  font-size: 15px;
}
.oa-brand small {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4f46e5;
}
.oa-mail {
  color: #4338ca;
  font-weight: 600;
  font-size: 13px;
  text-decoration: none;
}
.oa-main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 12px 20px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.oa-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 4px 4px;
}
.oa-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
}
.oa-hero h1 {
  margin: 0;
  font-size: 32px;
  letter-spacing: -0.03em;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.oa-sub {
  margin: 8px 0 0;
  color: #64748b;
  font-weight: 600;
}
.oa-pay {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}
.oa-pay div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.oa-pay span {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.oa-pay b {
  font-size: 20px;
  letter-spacing: -0.02em;
}
.oa-pay-due b {
  color: #4f46e5;
}
.oa-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.oa-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 18px 20px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}
.oa-card h2,
.oa-card-head h2 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}
.oa-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}
.oa-card-head h2 {
  margin: 0;
}
.oa-kv {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 10px 18px;
  margin: 0;
}
.oa-kv dt {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.oa-kv dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.oa-help,
.oa-muted {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 13.5px;
  line-height: 1.45;
}
.oa-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.oa-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}
.oa-span {
  grid-column: 1 / -1;
}
.oa-form :deep(select),
.oa-form :deep(input),
.oa-form :deep(textarea) {
  font: inherit;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 9px 10px;
  background: #fff;
}
.oa-ok {
  grid-column: 1 / -1;
  margin: 0;
  color: #047857;
  font-weight: 600;
}
.oa-err {
  grid-column: 1 / -1;
  margin: 0;
  color: #b91c1c;
  font-weight: 600;
}
.oa-empty {
  text-align: center;
  color: #64748b;
  padding: 48px 20px;
}
.oa-foot {
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  padding: 8px 20px 28px;
}
.col-actions {
  width: 150px;
  text-align: right;
}
@media (max-width: 800px) {
  .oa-pay,
  .oa-grid,
  .oa-form {
    grid-template-columns: 1fr;
  }
  .oa-hero {
    flex-direction: column;
  }
}
</style>
