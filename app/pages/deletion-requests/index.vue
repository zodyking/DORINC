<script setup lang="ts">
import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'
import {
  DELETION_ENTITY_TABS,
  deletionEntityLabel,
  deletionRequestApproveHint,
  deletionRequestApproveLabel,
  deletionRequestOutcomeSummary,
  deletionRequestPreviewText,
  deletionRequestSubmitter,
  deletionRequestTypeBadge,
  deletionStatusPill,
  deletionWhen,
} from '~/utils/deletion-requests-ui'
import { windowedPagerPages, listRangeLabel } from '~/utils/pager-ui'
import { avColor, initials } from '~/utils/users-ui'

definePageMeta({ layout: 'staff', name: 'staff-deletion-requests', permission: 'deletion_requests.review.all' })

interface DeletionRequestRow {
  id: string
  entityType: DeletionEntityType
  entityId: string
  status: string
  reason: string
  entityLabel: string
  submittedByName: string | null
  submittedByEmail: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  reviewReason: string | null
  createdAt: string
  entityHref: string
}

const auth = useAuthStore()
const canReview = computed(() => auth.can('deletion_requests.review.all'))

const tab = ref<'all' | DeletionEntityType>('all')
const status = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const q = ref('')
const page = ref(1)
const PAGE_SIZE = 25

watch([tab, status, q], () => { page.value = 1 })

const query = computed(() => ({
  entityType: tab.value === 'all' ? undefined : tab.value,
  status: status.value,
  q: q.value || undefined,
  page: page.value,
  pageSize: PAGE_SIZE,
}))

const { data, refresh, pending: loading } = useClientFetch<{
  items: DeletionRequestRow[]
  total: number
  pending: number
}>('/api/deletion-requests', { query })

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

const busyId = ref('')
const modalOpen = ref(false)
const modalMode = ref<'approve' | 'reject'>('approve')
const modalRow = ref<DeletionRequestRow | null>(null)
const modalReason = ref('')
const actionError = ref('')

const modalApproveLabel = computed(() =>
  modalRow.value ? deletionRequestApproveLabel(modalRow.value.entityType) : 'Confirm deletion',
)

function openModal(row: DeletionRequestRow, mode: 'approve' | 'reject') {
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
  if (modalMode.value === 'reject' && modalReason.value.trim().length < 3) {
    actionError.value = 'A rejection reason is required.'
    return
  }

  busyId.value = row.id
  actionError.value = ''
  try {
    const path = `/api/deletion-requests/${row.id}/${modalMode.value}`
    const body = modalReason.value.trim() ? { reason: modalReason.value.trim() } : {}
    await $fetch(path, { method: 'POST', body })
    closeModal()
    await refresh()
  }
  catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { message?: string, data?: { message?: string } } }).data?.data?.message
        ?? (err as { data?: { message?: string } }).data?.message
      : null
    actionError.value = msg || 'Unable to complete this action.'
  }
  finally {
    busyId.value = ''
  }
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Staff requests to permanently delete records — admin approval required">
      <template #title>Deletion requests</template>
      <template #actions>
        <NuxtLink to="/dashboard" class="btn">Dashboard</NuxtLink>
      </template>
    </StaffPageHead>

    <div v-if="!canReview" class="card">
      <div class="cbody" style="color:#94a3b8; font-size:13px;">
        You do not have permission to review deletion requests.
      </div>
    </div>

    <template v-else>
      <ListFilterBar
        v-model:search="q"
        search-placeholder="Search record, reason, or submitter…"
        search-aria-label="Search deletion requests"
        :count-label="listCountLabel"
        :filters-active="filtersDirty"
        filter-title="Filter requests"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <label class="fld">
            Record type
            <select v-model="tab" aria-label="Record type filter">
              <option v-for="t in DELETION_ENTITY_TABS" :key="t.key" :value="t.key">
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
          No deletion requests match this filter.
        </div>
        <div v-else id="deletion-req-queue">
          <div v-for="row in items" :key="row.id" class="modrow">
            <span class="av" :class="avColor(row.entityLabel)">{{ initials(row.entityLabel) }}</span>
            <div class="nm">
              <div class="row-title">
                <b>{{ row.entityLabel }}</b>
                <span :class="deletionRequestTypeBadge(row.entityType).cls">
                  {{ deletionRequestTypeBadge(row.entityType).label }}
                </span>
              </div>
              <small>
                {{ deletionEntityLabel(row.entityType) }}
                · {{ deletionRequestSubmitter(row.submittedByName, row.submittedByEmail) }}
                · {{ deletionWhen(row.createdAt) }}
              </small>

              <div class="request-preview">{{ deletionRequestPreviewText(row.reason) }}</div>

              <div class="request-meta">
                <NuxtLink :to="row.entityHref" class="link">View record</NuxtLink>
              </div>

              <div class="request-badges">
                <span :class="deletionStatusPill(row.status).cls">{{ deletionStatusPill(row.status).label }}</span>
              </div>
              <div v-if="row.reviewReason && row.status !== 'pending'" class="review-note">
                Staff note{{ row.reviewedByName ? ` (${row.reviewedByName})` : '' }}: {{ row.reviewReason }}
              </div>
            </div>
            <div v-if="row.status === 'pending'" class="acts">
              <button
                class="btn sm primary"
                type="button"
                :disabled="busyId === row.id"
                @click="openModal(row, 'approve')"
              >
                {{ deletionRequestApproveLabel(row.entityType) }}
              </button>
              <button
                class="btn sm"
                type="button"
                :disabled="busyId === row.id"
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
            <p v-if="modalMode === 'approve'">{{ deletionRequestApproveHint(modalRow.entityType) }}</p>
            <p v-else>The record stays active. Tell the requester why deletion was declined.</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeModal">×</button>
        </div>

        <div class="mbody">
          <div class="staff-req-modal-context">
            <p class="staff-req-modal-title">
              <b>{{ modalRow.entityLabel }}</b> — {{ deletionEntityLabel(modalRow.entityType) }}
            </p>
            <p class="staff-req-modal-meta">
              {{ deletionRequestSubmitter(modalRow.submittedByName, modalRow.submittedByEmail) }}
              · {{ deletionWhen(modalRow.createdAt) }}
            </p>
            <p v-if="modalMode === 'approve'" class="callout info staff-req-outcome">
              {{ deletionRequestOutcomeSummary(modalRow.entityType) }}
            </p>
          </div>

          <div class="staff-req-message">
            <p class="staff-req-message-label">Deletion reason</p>
            <div class="staff-req-message-body">{{ deletionRequestPreviewText(modalRow.reason) }}</div>
          </div>

          <div class="staff-req-links">
            <NuxtLink :to="modalRow.entityHref" class="link">View record</NuxtLink>
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
            :disabled="busyId === modalRow.id"
            @click="submitModal"
          >
            {{ modalMode === 'approve' ? 'Confirm deletion' : 'Confirm reject' }}
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
