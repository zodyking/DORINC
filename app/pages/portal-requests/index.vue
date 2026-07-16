<script setup lang="ts">
// Staff portal request review queues (mockup: Review queue / P2-09, P2-10).
import type { PortalInvoiceCorrectionPayload } from '#shared/portal-invoice-correction'
import type { PortalRequestReviewKind } from '~/shared/validators/portal-request-review'
import {
  STAFF_REQUEST_TABS,
  staffRequestActionType,
  staffRequestApproveHint,
  staffRequestApproveLabel,
  staffRequestKindLabel,
  staffRequestOutcomeSummary,
  staffRequestPreviewText,
  staffRequestStatusPill,
  staffRequestSubmitter,
  staffRequestTypeBadge,
  staffRequestUrgencyPill,
  staffRequestWhen,
} from '~/utils/portal-request-review-ui'
import { avColor, initials } from '~/utils/users-ui'
import { windowedPagerPages, listRangeLabel } from '~/utils/pager-ui'

definePageMeta({ layout: 'staff', name: 'staff-portal-requests', permission: 'portal_requests.review.all' })

interface StaffRequestRow {
  id: string
  kind: PortalRequestReviewKind
  status: string
  customerId: string
  customerName: string
  submittedByName: string | null
  submittedByEmail: string | null
  createdAt: string
  title: string
  summary: string
  detail: string | null
  urgency: string | null
  invoiceId: string | null
  invoiceNumberFormatted: string | null
  vehicleId: string | null
  vehicleLabel: string | null
  resultInvoiceId: string | null
  resultVehicleId: string | null
  reviewedAt: string | null
  reviewReason: string | null
  correctionPayload: PortalInvoiceCorrectionPayload | null
}

const auth = useAuthStore()
const canReview = computed(() => auth.can('portal_requests.review.all'))

const tab = ref<'all' | PortalRequestReviewKind>('all')
const status = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const q = ref('')
const page = ref(1)
const PAGE_SIZE = 25

watch([tab, status, q], () => { page.value = 1 })

const query = computed(() => ({
  kind: tab.value === 'all' ? undefined : tab.value,
  status: status.value,
  q: q.value || undefined,
  page: page.value,
  pageSize: PAGE_SIZE,
}))

const { data, refresh, pending: loading } = useClientFetch<{
  items: StaffRequestRow[]
  total: number
  pending: number
}>('/api/portal-requests', { query })

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pendingCount = computed(() => data.value?.pending ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const pagerPages = computed(() => windowedPagerPages(page.value, pageCount.value))
const rangeLabel = computed(() => listRangeLabel(page.value, PAGE_SIZE, total.value))

const filtersDirty = computed(() => tab.value !== 'all' || status.value !== 'pending' || !!q.value)

function clearFilters() {
  tab.value = 'all'
  status.value = 'pending'
  q.value = ''
}

const listCountLabel = computed(() => {
  if (loading.value && !items.value.length) return 'Loading…'
  const prefix = status.value === 'pending' ? 'Pending requests' : 'Request history'
  return `${prefix} · ${total.value}`
})

const busyKey = ref('')
const modalOpen = ref(false)
const modalMode = ref<'approve' | 'reject'>('approve')
const modalRow = ref<StaffRequestRow | null>(null)
const modalReason = ref('')
const actionError = ref('')
const applyFormRef = ref<{ validate: () => string | null, buildApplyPayload: () => Record<string, unknown> | null } | null>(null)

function rowKey(row: StaffRequestRow) {
  return `${row.kind}:${row.id}`
}

function openModal(row: StaffRequestRow, mode: 'approve' | 'reject') {
  modalRow.value = row
  modalMode.value = mode
  modalReason.value = ''
  actionError.value = ''
  applyFormRef.value = null
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalRow.value = null
  applyFormRef.value = null
}

const modalApproveLabel = computed(() => modalRow.value ? staffRequestApproveLabel(modalRow.value) : 'Approve')
const modalActionType = computed(() => modalRow.value ? staffRequestActionType(modalRow.value) : null)
const modalIsStructuredCorrection = computed(() => {
  const type = modalActionType.value
  return type === 'line_correction' || type === 'vehicle_correction'
})

async function submitModal() {
  const row = modalRow.value
  if (!row) return
  if (modalMode.value === 'reject' && !modalReason.value.trim()) {
    actionError.value = 'A rejection reason is required.'
    return
  }

  let correctionApply: Record<string, unknown> | undefined
  if (modalMode.value === 'approve' && modalIsStructuredCorrection.value && applyFormRef.value) {
    const validationError = applyFormRef.value.validate()
    if (validationError) {
      actionError.value = validationError
      return
    }
    correctionApply = applyFormRef.value.buildApplyPayload() ?? undefined
  }

  const key = rowKey(row)
  busyKey.value = key
  actionError.value = ''
  try {
    const path = `/api/portal-requests/${row.kind}/${row.id}/${modalMode.value}`
    const body = modalMode.value === 'reject'
      ? { reason: modalReason.value.trim() }
      : {
          ...(modalReason.value.trim() ? { reason: modalReason.value.trim() } : {}),
          ...(correctionApply ? { correctionApply } : {}),
        }

    const result = await $fetch<{ invoice?: { id: string }, revision?: { id: string }, vehicle?: { id: string } }>(path, {
      method: 'POST',
      body,
    })

    closeModal()
    await refresh()

    if (result.invoice?.id) navigateTo(`/invoices/${result.invoice.id}/edit`)
    else if (result.revision?.id) navigateTo(`/invoices/${result.revision.id}/edit`)
    else if (result.vehicle?.id) navigateTo(`/vehicles/${result.vehicle.id}`)
  }
  catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { message?: string } }).data?.message
      : null
    actionError.value = msg || 'Unable to complete this action.'
  }
  finally {
    busyKey.value = ''
  }
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Customer service, billing, vehicle, and general requests awaiting staff review">
      <template #title>Portal requests</template>
      <template #actions>
        <NuxtLink to="/dashboard" class="btn">Dashboard</NuxtLink>
      </template>
    </StaffPageHead>

    <div v-if="!canReview" class="card">
      <div class="cbody" style="color:#94a3b8; font-size:13px;">
        You do not have permission to review portal requests.
      </div>
    </div>

    <template v-else>
      <ListFilterBar
        v-model:search="q"
        search-placeholder="Search customer, vehicle, invoice…"
        search-aria-label="Search requests"
        :count-label="listCountLabel"
        :filters-active="filtersDirty"
        filter-title="Filter requests"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <label class="fld">
            Request type
            <select v-model="tab" aria-label="Request type filter">
              <option v-for="t in STAFF_REQUEST_TABS" :key="t.key" :value="t.key">
                {{ t.label }}
              </option>
            </select>
          </label>
          <label class="fld">
            Status
            <select v-model="status" aria-label="Request status filter">
              <option value="pending">Pending only</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All statuses</option>
            </select>
          </label>
        </template>
      </ListFilterBar>

      <div class="card">
        <div class="chead">
          <h3>Review queue</h3>
          <div class="right">
            <span v-if="pendingCount" class="pill warn">{{ pendingCount }} pending</span>
          </div>
        </div>

        <div v-if="loading && !items.length" class="cbody" style="color:#94a3b8; font-size:13px;">Loading…</div>
        <div v-else-if="!items.length" class="cbody" style="color:#94a3b8; font-size:13px;">
          No requests match this filter.
        </div>
        <div v-else id="portal-req-queue">
          <div v-for="row in items" :key="rowKey(row)" class="modrow">
            <span class="av" :class="avColor(row.customerName)">{{ initials(row.customerName) }}</span>
            <div class="nm">
              <div class="row-title">
                <b>{{ row.title }}</b>
                <span :class="staffRequestTypeBadge(row).cls">{{ staffRequestTypeBadge(row).label }}</span>
              </div>
              <small>
                {{ row.customerName }} · {{ staffRequestKindLabel(row.kind) }}
                · {{ staffRequestSubmitter(row.submittedByName, row.submittedByEmail) }}
                · {{ staffRequestWhen(row.createdAt) }}
              </small>

              <StaffPortalRequestCorrectionDiff
                v-if="row.correctionPayload"
                :payload="row.correctionPayload"
                compact
              />
              <div v-else class="request-preview">{{ staffRequestPreviewText(row) }}</div>

              <div class="request-meta">
                <span v-if="row.vehicleLabel">Vehicle: {{ row.vehicleLabel }}</span>
                <span v-if="row.invoiceNumberFormatted">
                  Invoice:
                  <NuxtLink v-if="row.invoiceId" :to="`/invoices/${row.invoiceId}`" class="link">
                    {{ row.invoiceNumberFormatted }}
                  </NuxtLink>
                  <template v-else>{{ row.invoiceNumberFormatted }}</template>
                </span>
              </div>

              <div class="request-badges">
                <span :class="staffRequestStatusPill(row.status).cls">{{ staffRequestStatusPill(row.status).label }}</span>
                <span v-if="staffRequestUrgencyPill(row.urgency)" :class="staffRequestUrgencyPill(row.urgency)!.cls">
                  {{ staffRequestUrgencyPill(row.urgency)!.label }}
                </span>
                <NuxtLink
                  v-if="row.resultInvoiceId"
                  :to="`/invoices/${row.resultInvoiceId}`"
                  class="btn sm"
                >
                  View result invoice
                </NuxtLink>
                <NuxtLink
                  v-if="row.resultVehicleId"
                  :to="`/vehicles/${row.resultVehicleId}`"
                  class="btn sm"
                >
                  View vehicle
                </NuxtLink>
              </div>
              <div v-if="row.reviewReason && row.status !== 'pending'" class="review-note">
                Staff note: {{ row.reviewReason }}
              </div>
            </div>
            <div v-if="row.status === 'pending'" class="acts">
              <button
                class="btn sm primary"
                type="button"
                :disabled="busyKey === rowKey(row)"
                @click="openModal(row, 'approve')"
              >
                {{ staffRequestApproveLabel(row) }}
              </button>
              <button
                class="btn sm"
                type="button"
                :disabled="busyKey === rowKey(row)"
                @click="openModal(row, 'reject')"
              >
                Reject
              </button>
            </div>
          </div>
        </div>

        <div v-if="total > 0" class="cfoot">
          <span>{{ rangeLabel }}</span>
          <div v-if="pageCount > 1" class="pager">
            <button type="button" aria-label="Previous page" :disabled="page <= 1" @click="page--">‹</button>
            <button
              v-for="p in pagerPages"
              :key="p"
              type="button"
              :class="{ on: p === page }"
              @click="page = p"
            >
              {{ p }}
            </button>
            <button type="button" aria-label="Next page" :disabled="page >= pageCount" @click="page++">›</button>
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="modalOpen && modalRow"
      class="modal-scrim open"
      @click.self="closeModal"
    >
      <div class="modal staff-req-modal" role="dialog" aria-modal="true" @click.stop>
        <div class="mhead">
          <div>
            <h3>{{ modalMode === 'approve' ? modalApproveLabel : 'Reject request' }}</h3>
            <p v-if="modalMode === 'approve'">{{ staffRequestApproveHint(modalRow) }}</p>
            <p v-else>Tell the customer why this request was declined.</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeModal">×</button>
        </div>

        <div class="mbody">
          <div class="staff-req-modal-context">
            <p class="staff-req-modal-title"><b>{{ modalRow.title }}</b> — {{ modalRow.customerName }}</p>
            <p class="staff-req-modal-meta">
              {{ staffRequestKindLabel(modalRow.kind) }}
              · {{ staffRequestSubmitter(modalRow.submittedByName, modalRow.submittedByEmail) }}
              · {{ staffRequestWhen(modalRow.createdAt) }}
            </p>
            <p v-if="modalMode === 'approve'" class="callout info staff-req-outcome">
              {{ staffRequestOutcomeSummary(modalRow) }}
            </p>
          </div>

          <StaffPortalRequestCorrectionApplyForm
            v-if="modalMode === 'approve' && modalRow.correctionPayload"
            ref="applyFormRef"
            :payload="modalRow.correctionPayload"
          />
          <StaffPortalRequestCorrectionDiff
            v-else-if="modalRow.correctionPayload"
            :payload="modalRow.correctionPayload"
          />

          <div v-else class="staff-req-message">
            <p class="staff-req-message-label">Customer message</p>
            <div class="staff-req-message-body">{{ staffRequestPreviewText(modalRow) }}</div>
            <p v-if="modalRow.detail && modalRow.detail !== modalRow.summary" class="staff-req-message-extra">
              {{ modalRow.detail }}
            </p>
          </div>

          <div v-if="modalRow.invoiceNumberFormatted || modalRow.vehicleLabel" class="staff-req-links">
            <span v-if="modalRow.invoiceNumberFormatted">
              Invoice:
              <NuxtLink v-if="modalRow.invoiceId" :to="`/invoices/${modalRow.invoiceId}`" class="link">
                {{ modalRow.invoiceNumberFormatted }}
              </NuxtLink>
              <template v-else>{{ modalRow.invoiceNumberFormatted }}</template>
            </span>
            <span v-if="modalRow.vehicleLabel">Vehicle: {{ modalRow.vehicleLabel }}</span>
          </div>

          <label class="fld" style="margin-top:16px;">
            <span>{{ modalMode === 'reject' ? 'Rejection reason' : 'Staff note (optional)' }}</span>
            <textarea
              v-model="modalReason"
              rows="4"
              :required="modalMode === 'reject'"
              :placeholder="modalMode === 'reject' ? 'Required — visible in audit log' : 'Optional internal note'"
            />
          </label>
          <p v-if="actionError" class="staff-req-error">{{ actionError }}</p>
        </div>

        <div class="mfoot">
          <button type="button" class="btn" @click="closeModal">Cancel</button>
          <button
            type="button"
            class="btn primary"
            :disabled="busyKey === rowKey(modalRow)"
            @click="submitModal"
          >
            {{
              modalMode === 'approve'
                ? (modalIsStructuredCorrection ? 'Confirm apply' : 'Confirm resolve')
                : 'Confirm reject'
            }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.modrow {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  align-items: flex-start;
}
.modrow:last-child { border-bottom: none; }
.modrow .nm { flex: 1; min-width: 0; }
.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.row-title b { font-size: 14px; }
.modrow .nm small { color: #94a3b8; font-size: 12px; }
.modrow .acts { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.request-preview {
  margin-top: 8px;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  white-space: pre-wrap;
}
.request-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}
.request-badges {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.review-note {
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
}
.staff-req-modal {
  width: min(640px, 100%);
}
.staff-req-modal-context {
  margin-bottom: 12px;
}
.staff-req-modal-title {
  margin: 0 0 4px;
  font-size: 14px;
}
.staff-req-modal-meta {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.staff-req-outcome {
  margin: 12px 0 0;
  font-size: 13px;
}
.staff-req-message-label {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.staff-req-message-body {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  color: #334155;
}
.staff-req-message-extra {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
  white-space: pre-wrap;
}
.staff-req-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  font-size: 12px;
  color: #64748b;
}
.staff-req-error {
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
}
</style>
