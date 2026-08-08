<script setup lang="ts">
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

type ViewMode = 'queue' | 'log'
type ModalStep = 'review' | 'accept' | 'reject'

const auth = useAuthStore()
const canReview = computed(() => auth.can('portal_requests.review.all'))

const view = ref<ViewMode>('queue')
const tab = ref<'all' | PortalRequestReviewKind>('all')
const logStatus = ref<'decided' | 'approved' | 'rejected'>('decided')
const q = ref('')
const page = ref(1)
const PAGE_SIZE = 25

watch([view, tab, logStatus, q], () => { page.value = 1 })

const queryStatus = computed(() => (
  view.value === 'queue' ? 'pending' as const : logStatus.value
))

const query = computed(() => ({
  kind: tab.value === 'all' ? undefined : tab.value,
  status: queryStatus.value,
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

const filtersDirty = computed(() => {
  if (view.value === 'queue') return tab.value !== 'all' || !!q.value
  return tab.value !== 'all' || logStatus.value !== 'decided' || !!q.value
})

function clearFilters() {
  tab.value = 'all'
  logStatus.value = 'decided'
  q.value = ''
}

const listCountLabel = computed(() => {
  if (loading.value && !items.value.length) return 'Loading…'
  if (view.value === 'queue') return `Pending queue · ${total.value}`
  return `Decision log · ${total.value}`
})

const busyKey = ref('')
const modalOpen = ref(false)
const modalStep = ref<ModalStep>('review')
const modalRow = ref<StaffRequestRow | null>(null)
const modalReason = ref('')
const actionError = ref('')
const applyFormRef = ref<{ validate: () => string | null, buildApplyPayload: () => Record<string, unknown> | null } | null>(null)

function rowKey(row: StaffRequestRow) {
  return `${row.kind}:${row.id}`
}

function openReview(row: StaffRequestRow) {
  modalRow.value = row
  modalStep.value = 'review'
  modalReason.value = ''
  actionError.value = ''
  applyFormRef.value = null
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalRow.value = null
  modalStep.value = 'review'
  applyFormRef.value = null
}

function beginAccept() {
  modalStep.value = 'accept'
  modalReason.value = ''
  actionError.value = ''
}

function beginReject() {
  modalStep.value = 'reject'
  modalReason.value = ''
  actionError.value = ''
}

function backToReview() {
  modalStep.value = 'review'
  modalReason.value = ''
  actionError.value = ''
}

const modalApproveLabel = computed(() => modalRow.value ? staffRequestApproveLabel(modalRow.value) : 'Accept')
const modalActionType = computed(() => modalRow.value ? staffRequestActionType(modalRow.value) : null)
const modalIsStructuredCorrection = computed(() => {
  const type = modalActionType.value
  return type === 'line_correction' || type === 'vehicle_correction'
})

async function submitDecision(action: 'approve' | 'reject') {
  const row = modalRow.value
  if (!row) return
  if (action === 'reject' && !modalReason.value.trim()) {
    actionError.value = 'A rejection reason is required.'
    return
  }

  let correctionApply: Record<string, unknown> | undefined
  if (action === 'approve' && modalIsStructuredCorrection.value && applyFormRef.value) {
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
    const path = `/api/portal-requests/${row.kind}/${row.id}/${action}`
    const body = action === 'reject'
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
      <div class="req-view-bar">
        <div class="req-view-toggle" role="tablist" aria-label="Portal request views">
          <button
            type="button"
            role="tab"
            :class="{ on: view === 'queue' }"
            :aria-selected="view === 'queue'"
            @click="view = 'queue'"
          >
            Queue{{ pendingCount ? ` (${pendingCount})` : '' }}
          </button>
          <button
            type="button"
            role="tab"
            :class="{ on: view === 'log' }"
            :aria-selected="view === 'log'"
            @click="view = 'log'"
          >
            Decision log
          </button>
        </div>
      </div>

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
          <label v-if="view === 'log'" class="fld">
            Decision
            <select v-model="logStatus" aria-label="Decision filter">
              <option value="decided">All decisions</option>
              <option value="approved">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </template>
      </ListFilterBar>

      <div class="card">
        <div class="chead">
          <h3>{{ view === 'queue' ? 'Pending queue' : 'Decision log' }}</h3>
          <div class="right">
            <span v-if="view === 'queue' && pendingCount" class="pill warn">{{ pendingCount }} pending</span>
          </div>
        </div>

        <div v-if="loading && !items.length" class="cbody" style="color:#94a3b8; font-size:13px;">Loading…</div>
        <div v-else-if="!items.length" class="cbody" style="color:#94a3b8; font-size:13px;">
          {{ view === 'queue' ? 'No pending portal requests.' : 'No past portal decisions match this filter.' }}
        </div>

        <div v-else-if="view === 'queue'" id="portal-req-queue">
          <div v-for="row in items" :key="rowKey(row)" class="req-row">
            <span class="av" :class="avColor(row.customerName)">{{ initials(row.customerName) }}</span>
            <div class="req-row__main">
              <div class="req-row__title">
                <b>{{ row.title }}</b>
                <span :class="staffRequestTypeBadge(row).cls">{{ staffRequestTypeBadge(row).label }}</span>
                <span
                  v-if="staffRequestUrgencyPill(row.urgency)"
                  :class="staffRequestUrgencyPill(row.urgency)!.cls"
                >
                  {{ staffRequestUrgencyPill(row.urgency)!.label }}
                </span>
              </div>
              <p class="req-row__meta">
                {{ row.customerName }}
                · {{ staffRequestKindLabel(row.kind) }}
                · {{ staffRequestSubmitter(row.submittedByName, row.submittedByEmail) }}
                · {{ staffRequestWhen(row.createdAt) }}
              </p>

              <StaffPortalRequestCorrectionDiff
                v-if="row.correctionPayload"
                :payload="row.correctionPayload"
                compact
              />
              <div v-else class="req-row__preview">{{ staffRequestPreviewText(row) }}</div>

              <div class="req-row__links">
                <span v-if="row.vehicleLabel">Vehicle: {{ row.vehicleLabel }}</span>
                <span v-if="row.invoiceNumberFormatted">
                  Invoice:
                  <NuxtLink v-if="row.invoiceId" :to="`/invoices/${row.invoiceId}`" class="link">
                    {{ row.invoiceNumberFormatted }}
                  </NuxtLink>
                  <template v-else>{{ row.invoiceNumberFormatted }}</template>
                </span>
              </div>
            </div>
            <div class="req-row__acts">
              <button
                class="btn sm primary"
                type="button"
                :disabled="busyKey === rowKey(row)"
                @click="openReview(row)"
              >
                Review
              </button>
            </div>
          </div>
        </div>

        <div v-else class="tscroll">
          <table id="portal-req-log" class="tbl audit-tbl req-log-tbl">
            <thead>
              <tr>
                <th class="col-when">Requested</th>
                <th>Request</th>
                <th>Customer</th>
                <th class="col-decision">Decision</th>
                <th>Reviewed</th>
                <th class="col-detail">Note / result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in items" :key="rowKey(row)">
                <td class="col-when mono">{{ staffRequestWhen(row.createdAt) }}</td>
                <td>
                  <b>{{ row.title }}</b>
                  <div class="muted">{{ staffRequestKindLabel(row.kind) }}</div>
                </td>
                <td>
                  <div>{{ row.customerName }}</div>
                  <div class="muted">{{ staffRequestSubmitter(row.submittedByName, row.submittedByEmail) }}</div>
                </td>
                <td class="col-decision">
                  <span :class="staffRequestStatusPill(row.status).cls">
                    {{ row.status === 'approved' ? 'Accepted' : staffRequestStatusPill(row.status).label }}
                  </span>
                </td>
                <td>
                  <div class="muted">{{ row.reviewedAt ? staffRequestWhen(row.reviewedAt) : '—' }}</div>
                </td>
                <td class="col-detail">
                  <div>{{ row.reviewReason || '—' }}</div>
                  <div v-if="row.resultInvoiceId || row.resultVehicleId" class="req-row__links" style="margin-top:6px;">
                    <NuxtLink
                      v-if="row.resultInvoiceId"
                      :to="`/invoices/${row.resultInvoiceId}`"
                      class="link"
                    >
                      Result invoice
                    </NuxtLink>
                    <NuxtLink
                      v-if="row.resultVehicleId"
                      :to="`/vehicles/${row.resultVehicleId}`"
                      class="link"
                    >
                      Result vehicle
                    </NuxtLink>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
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
      <div class="modal req-modal" role="dialog" aria-modal="true" aria-labelledby="portal-review-title" @click.stop>
        <div class="mhead">
          <div>
            <h3 id="portal-review-title">
              {{
                modalStep === 'accept'
                  ? modalApproveLabel
                  : modalStep === 'reject'
                    ? 'Reject request'
                    : 'Review portal request'
              }}
            </h3>
            <p v-if="modalStep === 'review' && modalRow.status === 'pending'">
              Review the request, then accept or reject.
            </p>
            <p v-else-if="modalStep === 'review'">
              This request was already {{ modalRow.status === 'approved' ? 'accepted' : 'declined' }}.
            </p>
            <p v-else-if="modalStep === 'accept'">{{ staffRequestApproveHint(modalRow) }}</p>
            <p v-else>Tell the customer why this request was declined.</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeModal">×</button>
        </div>

        <div class="mbody req-modal__grid">
          <div class="req-modal__panel">
            <p class="req-modal__kicker">Request</p>
            <p class="req-modal__title">{{ modalRow.title }}</p>
            <p class="req-modal__meta">
              {{ modalRow.customerName }}
              · {{ staffRequestKindLabel(modalRow.kind) }}
              · {{ staffRequestSubmitter(modalRow.submittedByName, modalRow.submittedByEmail) }}
              · {{ staffRequestWhen(modalRow.createdAt) }}
            </p>
          </div>

          <StaffPortalRequestCorrectionApplyForm
            v-if="modalStep === 'accept' && modalRow.correctionPayload"
            ref="applyFormRef"
            :payload="modalRow.correctionPayload"
          />
          <StaffPortalRequestCorrectionDiff
            v-else-if="modalRow.correctionPayload"
            :payload="modalRow.correctionPayload"
          />
          <div v-else class="req-modal__panel">
            <p class="req-modal__kicker">Customer message</p>
            <p class="req-modal__body-text">{{ staffRequestPreviewText(modalRow) }}</p>
            <p
              v-if="modalRow.detail && modalRow.detail !== modalRow.summary"
              class="req-modal__meta"
              style="margin-top:8px; white-space:pre-wrap;"
            >
              {{ modalRow.detail }}
            </p>
          </div>

          <div v-if="modalRow.invoiceNumberFormatted || modalRow.vehicleLabel" class="req-modal__links">
            <span v-if="modalRow.invoiceNumberFormatted">
              Invoice:
              <NuxtLink v-if="modalRow.invoiceId" :to="`/invoices/${modalRow.invoiceId}`" class="link">
                {{ modalRow.invoiceNumberFormatted }}
              </NuxtLink>
              <template v-else>{{ modalRow.invoiceNumberFormatted }}</template>
            </span>
            <span v-if="modalRow.vehicleLabel">Vehicle: {{ modalRow.vehicleLabel }}</span>
          </div>

          <p v-if="modalStep === 'accept'" class="callout info">
            {{ staffRequestOutcomeSummary(modalRow) }}
          </p>

          <label v-if="modalStep === 'accept' || modalStep === 'reject'" class="fld">
            <span>{{ modalStep === 'reject' ? 'Rejection reason' : 'Staff note (optional)' }}</span>
            <textarea
              v-model="modalReason"
              rows="4"
              :required="modalStep === 'reject'"
              :placeholder="modalStep === 'reject' ? 'Required — visible to the customer and in the decision log' : 'Optional internal note'"
            />
          </label>

          <p v-if="modalRow.reviewReason && modalRow.status !== 'pending'" class="req-modal__foot-note">
            Staff note: {{ modalRow.reviewReason }}
          </p>
          <p v-if="actionError" class="req-modal__error">{{ actionError }}</p>
        </div>

        <div class="mfoot">
          <button
            v-if="modalStep !== 'review'"
            type="button"
            class="btn"
            @click="backToReview"
          >
            Back
          </button>
          <button
            v-else
            type="button"
            class="btn"
            @click="closeModal"
          >
            {{ modalRow.status === 'pending' ? 'Cancel' : 'Close' }}
          </button>
          <span class="spacer" />
          <template v-if="modalStep === 'review' && modalRow.status === 'pending'">
            <button type="button" class="btn reject" @click="beginReject">Reject</button>
            <button type="button" class="btn primary" @click="beginAccept">Accept</button>
          </template>
          <button
            v-else-if="modalStep === 'accept'"
            type="button"
            class="btn primary"
            :disabled="busyKey === rowKey(modalRow)"
            @click="submitDecision('approve')"
          >
            {{ modalIsStructuredCorrection ? 'Confirm apply' : 'Confirm resolve' }}
          </button>
          <button
            v-else-if="modalStep === 'reject'"
            type="button"
            class="btn primary"
            :disabled="busyKey === rowKey(modalRow)"
            @click="submitDecision('reject')"
          >
            Confirm reject
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style src="~/assets/css/staff-request-review.css"></style>
<style scoped>
.mono {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 12px;
}
</style>
