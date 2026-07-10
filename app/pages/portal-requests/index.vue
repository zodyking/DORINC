<script setup lang="ts">
// Staff portal request review queues (mockup: Review queue / P2-09, P2-10).
import type { PortalRequestReviewKind } from '~/shared/validators/portal-request-review'
import {
  STAFF_REQUEST_TABS,
  staffRequestApproveHint,
  staffRequestApproveLabel,
  staffRequestKindLabel,
  staffRequestStatusPill,
  staffRequestSubmitter,
  staffRequestUrgencyPill,
  staffRequestWhen,
} from '~/utils/portal-request-review-ui'
import { avColor, initials } from '~/utils/users-ui'

definePageMeta({ layout: 'staff', name: 'staff-portal-requests' })

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

const { data, refresh, pending: loading } = await useFetch<{
  items: StaffRequestRow[]
  total: number
  pending: number
}>('/api/portal-requests', { query })

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pendingCount = computed(() => data.value?.pending ?? 0)

const filtersDirty = computed(() => tab.value !== 'all' || status.value !== 'pending' || !!q.value)

function clearFilters() {
  tab.value = 'all'
  status.value = 'pending'
  q.value = ''
}

const listCountLabel = computed(() => {
  if (loading.value && !items.length) return 'Loading…'
  const prefix = status.value === 'pending' ? 'Pending requests' : 'Request history'
  return `${prefix} · ${total.value}`
})

const busyKey = ref('')
const modalOpen = ref(false)
const modalMode = ref<'approve' | 'reject'>('approve')
const modalRow = ref<StaffRequestRow | null>(null)
const modalReason = ref('')
const actionError = ref('')

function rowKey(row: StaffRequestRow) {
  return `${row.kind}:${row.id}`
}

function openModal(row: StaffRequestRow, mode: 'approve' | 'reject') {
  modalRow.value = row
  modalMode.value = mode
  modalReason.value = ''
  actionError.value = ''
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalRow.value = null
}

async function submitModal() {
  const row = modalRow.value
  if (!row) return
  if (modalMode.value === 'reject' && !modalReason.value.trim()) {
    actionError.value = 'A rejection reason is required.'
    return
  }

  const key = rowKey(row)
  busyKey.value = key
  actionError.value = ''
  try {
    const path = `/api/portal-requests/${row.kind}/${row.id}/${modalMode.value}`
    const body = modalMode.value === 'reject'
      ? { reason: modalReason.value.trim() }
      : modalReason.value.trim() ? { reason: modalReason.value.trim() } : {}

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
    <div class="pagehead">
      <div>
        <h2>Portal requests</h2>
        <p>Customer service, billing, vehicle, and general requests awaiting staff review</p>
      </div>
      <div class="actions">
        <NuxtLink to="/dashboard" class="btn">Dashboard</NuxtLink>
      </div>
    </div>

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
              <b>{{ row.title }}</b>
              <small>
                {{ row.customerName }} · {{ staffRequestKindLabel(row.kind) }}
                · {{ staffRequestSubmitter(row.submittedByName, row.submittedByEmail) }}
                · {{ staffRequestWhen(row.createdAt) }}
              </small>
              <div style="margin-top:6px; font-size:13px; color:#cbd5e1;">{{ row.summary }}</div>
              <div v-if="row.detail" style="margin-top:4px; font-size:12px; color:#94a3b8;">{{ row.detail }}</div>
              <div v-if="row.vehicleLabel" style="margin-top:4px; font-size:12px; color:#94a3b8;">Vehicle: {{ row.vehicleLabel }}</div>
              <div v-if="row.invoiceNumberFormatted" style="margin-top:4px; font-size:12px; color:#94a3b8;">
                Invoice: {{ row.invoiceNumberFormatted }}
              </div>
              <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                <span :class="staffRequestStatusPill(row.status).cls">{{ staffRequestStatusPill(row.status).label }}</span>
                <span v-if="staffRequestUrgencyPill(row.urgency)" :class="staffRequestUrgencyPill(row.urgency)!.cls">
                  {{ staffRequestUrgencyPill(row.urgency)!.label }}
                </span>
                <NuxtLink
                  v-if="row.resultInvoiceId"
                  :to="`/invoices/${row.resultInvoiceId}`"
                  class="btn sm"
                  style="margin-left:4px;"
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
              <div v-if="row.reviewReason && row.status !== 'pending'" style="margin-top:6px; font-size:12px; color:#94a3b8;">
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
                {{ staffRequestApproveLabel(row.kind) }}
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
      </div>
    </template>

    <div v-if="modalOpen && modalRow" class="modal open" role="dialog" aria-modal="true">
      <div class="sheet">
        <div class="chead">
          <h3>{{ modalMode === 'approve' ? staffRequestApproveLabel(modalRow.kind) : 'Reject request' }}</h3>
          <button type="button" class="btn sm" @click="closeModal">Close</button>
        </div>
        <div class="cbody">
          <p style="font-size:13px; color:#94a3b8; margin:0 0 12px;">
            {{ modalMode === 'approve' ? staffRequestApproveHint(modalRow.kind) : 'Tell the customer why this request was declined.' }}
          </p>
          <p style="margin:0 0 12px;"><b>{{ modalRow.title }}</b> — {{ modalRow.customerName }}</p>
          <label class="fld">
            <span>{{ modalMode === 'reject' ? 'Rejection reason' : 'Staff note (optional)' }}</span>
            <textarea
              v-model="modalReason"
              rows="4"
              :required="modalMode === 'reject'"
              :placeholder="modalMode === 'reject' ? 'Required — visible in audit log' : 'Optional internal note'"
            />
          </label>
          <p v-if="actionError" style="color:#f87171; font-size:13px; margin:8px 0 0;">{{ actionError }}</p>
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button
              type="button"
              class="btn primary"
              :disabled="busyKey === rowKey(modalRow)"
              @click="submitModal"
            >
              {{ modalMode === 'approve' ? 'Confirm approve' : 'Confirm reject' }}
            </button>
            <button type="button" class="btn" @click="closeModal">Cancel</button>
          </div>
        </div>
      </div>
      <button class="modal-scrim" aria-label="Close dialog" @click="closeModal" />
    </div>
  </section>
</template>

<style scoped>
.chiprow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 12px;
}
.chip {
  border: 1px solid #334155;
  background: transparent;
  color: #cbd5e1;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
.chip.on {
  background: #1e293b;
  border-color: #64748b;
  color: #f8fafc;
}
.modal.open {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-scrim {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(2, 6, 23, 0.72);
}
.sheet {
  position: relative;
  z-index: 1;
  width: min(520px, 100%);
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  overflow: hidden;
}
</style>
