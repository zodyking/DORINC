<script setup lang="ts">
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'
import { portalInvoiceStatus } from '~/utils/portal-dashboard-ui'
import type { VehicleDisplay } from '~/utils/vehicles-ui'
import {
  PORTAL_BILLING_TOPICS,
  PORTAL_SERVICE_CATEGORIES,
  PORTAL_SERVICE_URGENCIES,
} from '~/utils/portal-requests-ui'

definePageMeta({
  layout: false,
})

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
})

const route = useRoute()
const customer = computed(() => String(route.params.customer ?? ''))
const token = computed(() => String(route.params.token ?? ''))
const number = computed(() => String(route.params.number ?? ''))
const apiBase = computed(() => (
  `/api/public/i/${encodeURIComponent(customer.value)}/${encodeURIComponent(token.value)}/${encodeURIComponent(number.value)}`
))

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
  balanceDue: string
  amountPaid: string
  paidAt: string | null
  vehicleId: string | null
  vehicleLabel: string
  vehicle: PublicVehicle | null
  customerName: string
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
  () => apiBase.value,
  { watch: [apiBase] },
)

const displayBusinessName = computed(() => invoice.value?.company.businessName?.trim() || BRAND_NAME)

useHead(() => ({
  title: invoice.value
    ? `${invoice.value.invoiceNumberFormatted} · ${displayBusinessName.value}`
    : `Invoice · ${BRAND_NAME}`,
}))

const statusPill = computed(() => {
  if (!invoice.value) return { cls: 'pill gray', label: '—' }
  return portalInvoiceStatus(
    invoice.value.status,
    invoice.value.dueDate,
    invoice.value.balanceDue,
  )
})

const changeUrl = computed(() => `${apiBase.value}/change-requests`)

function vehicleSummary(vehicle: PublicVehicle | null, fallback: string): string {
  if (!vehicle) return fallback && fallback !== '—' ? fallback : 'Vehicle'
  const unit = vehicle.busNumber ? `#${vehicle.busNumber}` : (vehicle.unitTag || '')
  const ymm = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  return [unit, ymm].filter(Boolean).join(' · ') || fallback
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
const helpOpen = ref<'service' | 'billing' | null>(null)

function openCorrection(line: PublicInvoicePage['lineItems'][number]) {
  correctionLine.value = line
  correctionOpen.value = true
}

function downloadPdf() {
  window.location.href = `${apiBase.value}/pdf`
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
    await $fetch(`${apiBase.value}/service-requests`, {
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

function closeHelp() {
  helpOpen.value = null
  serviceError.value = ''
  billingError.value = ''
}
</script>

<template>
  <div class="oa">
    <header class="oa-top">
      <div class="oa-brand">
        <img class="oa-logo" :src="BRAND_ICON" alt="" width="36" height="36">
        <div>
          <strong>{{ displayBusinessName }}</strong>
          <small>Online Access</small>
        </div>
      </div>
    </header>

    <main class="oa-main">
      <section v-if="pending && !invoice" class="oa-card oa-empty">Loading invoice…</section>
      <section v-else-if="error" class="oa-card oa-empty">This invoice is not available online.</section>

      <template v-else-if="invoice">
        <section class="oa-hero">
          <p class="oa-kicker">Invoice</p>
          <h1>{{ invoice.invoiceNumberFormatted }}</h1>
          <p class="oa-sub">{{ invoice.customerName }}</p>
          <div class="oa-hero-meta">
            <span :class="statusPill.cls">{{ statusPill.label }}</span>
            <span>{{ invoiceDateDisplay(invoice.invoiceDate) }}</span>
            <span v-if="invoice.dueDate">Due {{ invoiceDateDisplay(invoice.dueDate) }}</span>
          </div>
        </section>

        <section class="oa-pay" aria-label="Payment record">
          <div class="oa-pay-due">
            <span>Balance due</span>
            <b>{{ moneyDisplay(invoice.balanceDue) }}</b>
          </div>
          <div>
            <span>Total</span>
            <b>{{ moneyDisplay(invoice.total) }}</b>
          </div>
          <div>
            <span>Paid</span>
            <b>{{ moneyDisplay(invoice.amountPaid) }}</b>
          </div>
          <div>
            <span>Paid on</span>
            <b>{{ timestampDisplay(invoice.paidAt) }}</b>
          </div>
        </section>

        <section class="oa-card">
          <h2>Charges</h2>
          <ul class="oa-lines">
            <li v-for="line in invoice.lineItems" :key="line.id">
              <button type="button" class="oa-line" @click="openCorrection(line)">
                <span class="oa-line-copy">
                  <strong>{{ line.description }}</strong>
                  <small>Request a change</small>
                </span>
                <span class="oa-line-amt">{{ moneyDisplay(line.lineAmount) }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section v-if="invoice.vehicle" class="oa-card">
          <div class="oa-card-head">
            <div>
              <h2>Vehicle</h2>
              <p class="oa-summary">{{ vehicleSummary(invoice.vehicle, invoice.vehicleLabel) }}</p>
            </div>
            <button type="button" class="btn sm" @click="vehicleCorrectionOpen = true">
              Request change
            </button>
          </div>
        </section>

        <section class="oa-actions">
          <button
            v-if="invoice.hasPdf"
            type="button"
            class="btn primary oa-action"
            @click="downloadPdf"
          >
            Download PDF
          </button>
          <button
            v-if="invoice.vehicleId"
            type="button"
            class="btn oa-action"
            @click="helpOpen = 'service'"
          >
            Request service
          </button>
          <button type="button" class="btn oa-action" @click="helpOpen = 'billing'">
            Billing question
          </button>
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

    <div
      class="modal-scrim"
      :class="{ open: !!helpOpen }"
      @click.self="closeHelp"
    >
      <div v-if="helpOpen === 'service' && invoice" class="modal correction-modal" role="dialog" aria-modal="true">
        <div class="mhead">
          <div>
            <h3>Request service</h3>
            <p>We’ll follow up about this unit.</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeHelp">✕</button>
        </div>
        <form @submit.prevent="submitService">
          <div class="mbody oa-sheet">
            <label class="fld">
              <span>Category</span>
              <select v-model="serviceForm.serviceCategory">
                <option v-for="cat in PORTAL_SERVICE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </label>
            <label class="fld">
              <span>Urgency</span>
              <select v-model="serviceForm.urgency">
                <option v-for="u in PORTAL_SERVICE_URGENCIES" :key="u.value" :value="u.value">{{ u.label }}</option>
              </select>
            </label>
            <label class="fld">
              <span>What needs to be done?</span>
              <textarea v-model="serviceForm.description" required rows="4" maxlength="4000" />
            </label>
            <p v-if="serviceMessage" class="oa-ok">{{ serviceMessage }}</p>
            <p v-else-if="serviceError" class="oa-err">{{ serviceError }}</p>
          </div>
          <div class="mfoot">
            <button type="button" class="btn" @click="closeHelp">Cancel</button>
            <button type="submit" class="btn primary" :disabled="serviceBusy">
              {{ serviceBusy ? 'Sending…' : 'Send request' }}
            </button>
          </div>
        </form>
      </div>

      <div v-else-if="helpOpen === 'billing' && invoice" class="modal correction-modal" role="dialog" aria-modal="true">
        <div class="mhead">
          <div>
            <h3>Billing question</h3>
            <p v-if="invoice.company.email">Or email {{ invoice.company.email }}</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeHelp">✕</button>
        </div>
        <form @submit.prevent="submitBilling">
          <div class="mbody oa-sheet">
            <label class="fld">
              <span>Topic</span>
              <select v-model="billingForm.topic">
                <option v-for="topic in PORTAL_BILLING_TOPICS" :key="topic" :value="topic">{{ topic }}</option>
              </select>
            </label>
            <label class="fld">
              <span>Message</span>
              <textarea v-model="billingForm.description" required rows="4" maxlength="4000" />
            </label>
            <p v-if="billingMessage" class="oa-ok">{{ billingMessage }}</p>
            <p v-else-if="billingError" class="oa-err">{{ billingError }}</p>
          </div>
          <div class="mfoot">
            <button type="button" class="btn" @click="closeHelp">Cancel</button>
            <button type="submit" class="btn primary" :disabled="billingBusy">
              {{ billingBusy ? 'Sending…' : 'Send message' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oa {
  min-height: 100vh;
  min-height: 100dvh;
  background:
    radial-gradient(900px 280px at 0% -10%, #eef2ff 0%, transparent 60%),
    #f8fafc;
  color: #0f172a;
  padding-bottom: env(safe-area-inset-bottom);
}
.oa-top,
.oa-main,
.oa-foot {
  width: min(720px, calc(100% - 32px));
  margin-left: auto;
  margin-right: auto;
}
.oa-top {
  display: flex;
  align-items: center;
  padding: 18px 0 6px;
}
.oa-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.oa-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex: none;
}
.oa-brand strong {
  display: block;
  font-size: 14px;
  line-height: 1.2;
}
.oa-brand small {
  display: block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #4f46e5;
}
.oa-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 0 36px;
}
.oa-hero h1 {
  margin: 0;
  font-size: clamp(26px, 7vw, 36px);
  letter-spacing: -0.04em;
  line-height: 1.1;
}
.oa-kicker {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #94a3b8;
}
.oa-sub {
  margin: 6px 0 0;
  color: #64748b;
  font-weight: 600;
}
.oa-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 10px;
  align-items: center;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}
.oa-pay {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
}
.oa-pay div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.oa-pay span {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.oa-pay b {
  font-size: 18px;
  letter-spacing: -0.03em;
}
.oa-pay-due {
  grid-column: 1 / -1;
  padding-bottom: 8px;
  margin-bottom: 2px;
  border-bottom: 1px solid #e2e8f0;
}
.oa-pay-due b {
  font-size: 28px;
  color: #4f46e5;
}
.oa-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px;
}
.oa-card h2 {
  margin: 0 0 12px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #64748b;
}
.oa-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.oa-card-head h2 {
  margin: 0 0 6px;
}
.oa-summary {
  margin: 0;
  font-weight: 700;
  font-size: 15px;
  line-height: 1.35;
}
.oa-lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oa-line {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  min-height: 56px;
  cursor: pointer;
}
.oa-line-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.oa-line-copy strong {
  font-size: 14px;
  line-height: 1.3;
}
.oa-line-copy small {
  color: #6366f1;
  font-weight: 700;
  font-size: 11px;
}
.oa-line-amt {
  flex: none;
  font-weight: 800;
  font-size: 14px;
}
.oa-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oa-action {
  width: 100%;
  justify-content: center;
  min-height: 46px;
}
.oa-empty {
  text-align: center;
  color: #64748b;
  padding: 48px 16px;
}
.oa-foot {
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  padding: 4px 0 24px;
}
.oa-ok { margin: 0; color: #047857; font-weight: 600; }
.oa-err { margin: 0; color: #b91c1c; font-weight: 600; }
.oa-sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.correction-modal {
  width: min(560px, calc(100vw - 32px));
}
@media (min-width: 720px) {
  .oa-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .oa-pay {
    grid-template-columns: 1.4fr 1fr 1fr 1fr;
    align-items: end;
  }
  .oa-pay-due {
    grid-column: auto;
    border: 0;
    padding: 0;
    margin: 0;
  }
}
</style>
