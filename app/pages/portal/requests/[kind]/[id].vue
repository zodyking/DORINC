<script setup lang="ts">
import { invoiceDateDisplay } from '~/utils/invoices-ui'
import {
  portalCorrectionPayloadKind,
  type PortalInvoiceCorrectionPayload,
} from '#shared/portal-invoice-correction'
import {
  portalRequestKindLabel,
  portalRequestStatusPill,
  portalRequestUrgencyLabel,
} from '~/utils/portal-requests-ui'

definePageMeta({ layout: 'portal', middleware: 'portal-auth', name: 'portal-customer-request-detail' })

const route = useRoute()
const kind = computed(() => route.params.kind as string)
const id = computed(() => route.params.id as string)

interface PortalRequestDetail {
  id: string
  kind: string
  status: string
  statusLabel: string
  createdAt: string
  isOpen: boolean
  reviewedAt: string | null
  reviewReason: string | null
  title: string
  vehicleId: string | null
  vehicleLabel: string | null
  invoiceId: string | null
  invoiceNumberFormatted: string | null
  serviceCategory?: string
  urgency?: string
  preferredDate?: string | null
  location?: string | null
  topic?: string
  subject?: string
  description?: string
  message?: string
  fleetTag?: string
  unitType?: string
  correctionPayload?: PortalInvoiceCorrectionPayload | null
}

const { data: request, error, pending } = useClientFetch<PortalRequestDetail>(
  () => `/api/portal/requests/${kind.value}/${id.value}`,
  { watch: [kind, id] },
)

const statusPill = computed(() => {
  if (!request.value) return { cls: 'pill gray', label: '—' }
  return portalRequestStatusPill(request.value.status)
})

const submittedDate = computed(() => {
  if (!request.value) return '—'
  return invoiceDateDisplay(request.value.createdAt.slice(0, 10))
})

const correctionKind = computed(() => {
  const payload = request.value?.correctionPayload
  if (!payload) return null
  return portalCorrectionPayloadKind(payload)
})

function money(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return value
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n)
}
</script>

<template>
  <section class="page active portal-page">
    <div v-if="pending && !request" class="card">
      <div class="empty">Loading…</div>
    </div>

    <div v-else-if="error || !request" class="card">
      <div class="empty">Request not found.</div>
      <NuxtLink to="/portal/requests" class="btn ghost" style="margin-top:1rem;">Back to requests</NuxtLink>
    </div>

    <template v-else>
      <PortalPageHead :subtitle="`${portalRequestKindLabel(request.kind)} · Submitted ${submittedDate}`">
        <template #title>{{ request.title }}</template>
        <template #actions>
          <NuxtLink to="/portal/requests" class="btn ghost">Back</NuxtLink>
        </template>
      </PortalPageHead>

      <div class="card">
        <div class="chead">
          <h3>Status</h3>
          <span :class="statusPill.cls">{{ statusPill.label }}</span>
        </div>
        <div class="cbody">
          <div class="portal-kv-grid">
            <div><span class="k">Submitted</span><span class="v">{{ submittedDate }}</span></div>
            <div v-if="request.reviewedAt">
              <span class="k">Reviewed</span>
              <span class="v">{{ invoiceDateDisplay(request.reviewedAt.slice(0, 10)) }}</span>
            </div>
            <div v-if="request.vehicleLabel">
              <span class="k">Vehicle</span>
              <span class="v">{{ request.vehicleLabel }}</span>
            </div>
            <div v-if="request.invoiceNumberFormatted">
              <span class="k">Invoice</span>
              <span class="v">
                <NuxtLink
                  v-if="request.invoiceId"
                  :to="`/portal/invoices/${request.invoiceId}`"
                  class="link"
                >
                  {{ request.invoiceNumberFormatted }}
                </NuxtLink>
                <template v-else>{{ request.invoiceNumberFormatted }}</template>
              </span>
            </div>
          </div>
          <p v-if="request.reviewReason" class="callout info" style="margin-top:1rem;">
            Shop note: {{ request.reviewReason }}
          </p>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>Your request</h3></div>
        <div class="cbody">
          <template v-if="request.kind === 'service'">
            <div class="portal-kv-grid">
              <div><span class="k">Service type</span><span class="v">{{ request.serviceCategory }}</span></div>
              <div><span class="k">Urgency</span><span class="v">{{ portalRequestUrgencyLabel(request.urgency ?? 'normal') }}</span></div>
              <div v-if="request.preferredDate">
                <span class="k">Preferred date</span>
                <span class="v">{{ invoiceDateDisplay(request.preferredDate) }}</span>
              </div>
            </div>
            <label class="fld" style="margin-top:1rem;">
              <span>Details</span>
              <div class="portal-readonly-text">{{ request.description }}</div>
            </label>
          </template>

          <template v-else-if="request.kind === 'billing'">
            <div class="portal-kv-grid">
              <div><span class="k">Topic</span><span class="v">{{ request.topic }}</span></div>
            </div>

            <div v-if="request.correctionPayload && correctionKind === 'line_item'" class="portal-correction-block">
              <h4>Line item change</h4>
              <div class="row2">
                <div>
                  <p class="sub" style="margin-bottom:0.35rem;">Current</p>
                  <p>{{ request.correctionPayload.original.description }}</p>
                  <p class="sub">Qty/hrs {{ request.correctionPayload.original.quantity }} · Rate {{ money(request.correctionPayload.original.unitPrice) }}</p>
                </div>
                <div>
                  <p class="sub" style="margin-bottom:0.35rem;">Requested</p>
                  <p>{{ request.correctionPayload.proposed.description }}</p>
                  <p class="sub">Qty/hrs {{ request.correctionPayload.proposed.quantity }} · Rate {{ money(request.correctionPayload.proposed.unitPrice) }}</p>
                </div>
              </div>
              <p v-if="request.correctionPayload.notes" class="sub" style="margin-top:0.75rem;">Note: {{ request.correctionPayload.notes }}</p>
            </div>

            <div v-else-if="request.correctionPayload && correctionKind === 'vehicle'" class="portal-correction-block">
              <h4>Vehicle information change</h4>
              <p class="sub">See description below for requested updates.</p>
            </div>

            <label v-else class="fld" style="margin-top:1rem;">
              <span>Details</span>
              <div class="portal-readonly-text">{{ request.description }}</div>
            </label>

            <label v-if="request.correctionPayload" class="fld" style="margin-top:1rem;">
              <span>Full description</span>
              <div class="portal-readonly-text">{{ request.description }}</div>
            </label>
          </template>

          <template v-else-if="request.kind === 'vehicle_change'">
            <div class="portal-kv-grid">
              <div><span class="k">Subject</span><span class="v">{{ request.subject }}</span></div>
            </div>
            <label class="fld" style="margin-top:1rem;">
              <span>Details</span>
              <div class="portal-readonly-text">{{ request.description }}</div>
            </label>
          </template>

          <template v-else-if="request.kind === 'vehicle_add'">
            <div class="portal-kv-grid">
              <div><span class="k">Fleet tag</span><span class="v">{{ request.fleetTag }}</span></div>
              <div v-if="request.unitType"><span class="k">Unit type</span><span class="v">{{ request.unitType }}</span></div>
            </div>
            <label v-if="request.description" class="fld" style="margin-top:1rem;">
              <span>Notes</span>
              <div class="portal-readonly-text">{{ request.description }}</div>
            </label>
          </template>

          <template v-else>
            <div class="portal-kv-grid">
              <div><span class="k">Subject</span><span class="v">{{ request.subject }}</span></div>
            </div>
            <label class="fld" style="margin-top:1rem;">
              <span>Message</span>
              <div class="portal-readonly-text">{{ request.message }}</div>
            </label>
          </template>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.portal-kv-grid {
  display: grid;
  gap: 0.75rem 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.portal-kv-grid .k {
  display: block;
  font-size: 0.8125rem;
  color: var(--muted, #64748b);
  margin-bottom: 0.15rem;
}
.portal-kv-grid .v {
  display: block;
  font-weight: 600;
}
.portal-readonly-text {
  white-space: pre-wrap;
  line-height: 1.55;
  padding: 0.75rem 0.9rem;
  border-radius: 0.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.portal-correction-block {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  background: #fafafa;
}
.portal-correction-block h4 {
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
}
.chead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
</style>
