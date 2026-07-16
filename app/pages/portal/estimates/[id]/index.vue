<script setup lang="ts">
// Customer portal estimate detail — approve/reject actions (P3-03).
import { invoiceDateDisplay, moneyDisplay } from '~/utils/invoices-ui'
import {
  portalEstimateStatus,
} from '~/utils/portal-estimates-ui'
import { vehicleSub, vehicleTag, type VehicleDisplay } from '~/utils/vehicles-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const id = computed(() => route.params.id as string)

interface PortalEstimateDetail {
  id: string
  estimateNumberFormatted: string
  status: string
  estimateDate: string
  validUntil: string | null
  total: string
  subtotal: string
  taxAmount: string
  feesAmount: string
  discountAmount: string
  customerNotes: string | null
  vehicleLabel: string
  vehicle: VehicleDisplay | null
  canRespond: boolean
  convertedInvoiceId: string | null
  lineItems: Array<{
    id: string
    description: string
    quantity: string
    lineAmount: string
    lineType: string
  }>
}

const { data: estimate, error, pending, refresh } = useClientFetch<PortalEstimateDetail>(
  () => `/api/portal/estimates/${id.value}`,
  { watch: [id] },
)

const statusPill = computed(() => {
  if (!estimate.value) return { cls: 'pill gray', label: '—' }
  return portalEstimateStatus(estimate.value.status)
})

const vehicleLine = computed(() => {
  if (!estimate.value?.vehicle) return estimate.value?.vehicleLabel ?? '—'
  return `${vehicleTag(estimate.value.vehicle)} — ${vehicleSub(estimate.value.vehicle)}`
})

const responseNotes = ref('')
const acting = ref(false)
const actionError = ref('')

async function respond(action: 'approve' | 'reject') {
  if (!estimate.value?.canRespond) return
  acting.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/portal/estimates/${id.value}/${action}`, {
      method: 'POST',
      body: { notes: responseNotes.value.trim() || null },
    })
    await refresh()
  }
  catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { message?: string } }).data?.message
      : null
    actionError.value = msg ?? 'Unable to submit your response. Please try again.'
  }
  finally {
    acting.value = false
  }
}
</script>

<template>
  <section v-if="pending && !estimate" class="page active portal-page">
    <div class="card portal-card">
      <p class="portal-muted" style="padding: 18px; margin: 0;">Loading estimate…</p>
    </div>
  </section>

  <section v-else-if="error" class="page active portal-page">
    <div class="card portal-card">
      <p class="portal-empty">Estimate not found or you do not have access.</p>
    </div>
  </section>

  <section v-else-if="estimate" class="page active portal-page">
    <div class="pagehead portal-pagehead">
      <div>
        <h2>{{ estimate.estimateNumberFormatted }}</h2>
        <p>
          <NuxtLink to="/portal/estimates">← Estimates</NuxtLink>
          · {{ estimate.vehicleLabel }}
          · issued {{ invoiceDateDisplay(estimate.estimateDate) }}
        </p>
      </div>
    </div>

    <div v-if="estimate.canRespond" class="card portal-card portal-action">
      <div class="chead">
        <h3>Your response</h3>
        <span class="pill warn">Action required</span>
      </div>
      <p class="portal-muted">
        Review the line items below, then approve or decline this estimate.
        <span v-if="estimate.validUntil"> Valid until {{ invoiceDateDisplay(estimate.validUntil) }}.</span>
      </p>
      <div class="portal-form">
        <label class="fld">
          <span>Notes (optional)</span>
          <textarea
            v-model="responseNotes"
            rows="3"
            placeholder="Questions or comments for the shop…"
          />
        </label>
        <p v-if="actionError" class="portal-error">{{ actionError }}</p>
        <div class="actions">
          <button type="button" class="btn primary" :disabled="acting" @click="respond('approve')">
            Approve estimate
          </button>
          <button type="button" class="btn" :disabled="acting" @click="respond('reject')">
            Decline
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="estimate.status === 'converted' && estimate.convertedInvoiceId" class="card portal-card">
      <p class="portal-muted" style="padding: 16px 18px; margin: 0;">
        This estimate was approved and converted to an invoice.
        <NuxtLink :to="`/portal/invoices/${estimate.convertedInvoiceId}`">View invoice →</NuxtLink>
      </p>
    </div>

    <div class="cols">
      <div class="card portal-card">
        <div class="chead">
          <h3>Summary</h3>
          <span :class="statusPill.cls">{{ statusPill.label }}</span>
        </div>
        <dl class="kv">
          <dt>Vehicle</dt>
          <dd>{{ vehicleLine }}</dd>
          <dt v-if="estimate.validUntil">Valid until</dt>
          <dd v-if="estimate.validUntil">{{ invoiceDateDisplay(estimate.validUntil) }}</dd>
          <dt>Subtotal</dt>
          <dd>{{ moneyDisplay(estimate.subtotal) }}</dd>
          <dt>Tax</dt>
          <dd>{{ moneyDisplay(estimate.taxAmount) }}</dd>
          <dt>Total</dt>
          <dd style="color:#4f46e5;font-weight:700;">{{ moneyDisplay(estimate.total) }}</dd>
        </dl>
        <p v-if="estimate.customerNotes" class="portal-muted" style="padding: 0 18px 18px; margin: 0;">
          {{ estimate.customerNotes }}
        </p>
      </div>

      <div class="card portal-card">
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
              <tr v-for="line in estimate.lineItems" :key="line.id">
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
