<script setup lang="ts">
import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'
import {
  DELETION_ENTITY_TABS,
  deletionEntityLabel,
  deletionStatusPill,
  deletionWhen,
} from '~/utils/deletion-requests-ui'
import { avColor, initials } from '~/utils/users-ui'

definePageMeta({ layout: 'staff', name: 'staff-deletion-requests' })

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

const { data, refresh, pending: loading } = await useFetch<{
  items: DeletionRequestRow[]
  total: number
  pending: number
}>('/api/deletion-requests', { query })

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

const busyId = ref('')
const modalOpen = ref(false)
const modalMode = ref<'approve' | 'reject'>('approve')
const modalRow = ref<DeletionRequestRow | null>(null)
const modalReason = ref('')
const actionError = ref('')

function submitterLabel(row: DeletionRequestRow) {
  if (row.submittedByName) return row.submittedByName
  return row.submittedByEmail ?? 'Staff'
}

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
    <div class="pagehead">
      <div>
        <h2>Deletion requests</h2>
        <p>Staff requests to permanently delete records — admin approval required</p>
      </div>
      <div class="actions">
        <NuxtLink to="/dashboard" class="btn">Dashboard</NuxtLink>
      </div>
    </div>

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
        <div v-else>
          <div v-for="row in items" :key="row.id" class="modrow">
            <span class="av" :class="avColor(row.entityLabel)">{{ initials(row.entityLabel) }}</span>
            <div class="nm">
              <b>{{ row.entityLabel }}</b>
              <small>
                {{ deletionEntityLabel(row.entityType) }}
                · {{ submitterLabel(row) }}
                · {{ deletionWhen(row.createdAt) }}
              </small>
              <div style="margin-top:6px; font-size:13px; color:#cbd5e1;">{{ row.reason }}</div>
              <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                <span :class="deletionStatusPill(row.status).cls">{{ deletionStatusPill(row.status).label }}</span>
                <NuxtLink :to="row.entityHref" class="btn sm">View record</NuxtLink>
              </div>
              <div v-if="row.reviewReason && row.status !== 'pending'" style="margin-top:6px; font-size:12px; color:#94a3b8;">
                Admin note{{ row.reviewedByName ? ` (${row.reviewedByName})` : '' }}: {{ row.reviewReason }}
              </div>
            </div>
            <div v-if="row.status === 'pending'" class="acts">
              <button
                class="btn sm primary"
                type="button"
                :disabled="busyId === row.id"
                @click="openModal(row, 'approve')"
              >
                Approve deletion
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
      </div>
    </template>

    <div v-if="modalOpen && modalRow" class="modal open" role="dialog" aria-modal="true">
      <div class="sheet">
        <div class="chead">
          <h3>{{ modalMode === 'approve' ? 'Approve deletion' : 'Reject request' }}</h3>
          <button type="button" class="btn sm" @click="closeModal">Close</button>
        </div>
        <div class="cbody">
          <p style="font-size:13px; color:#94a3b8; margin:0 0 12px;">
            {{ modalMode === 'approve'
              ? 'The record will be permanently deleted. Related invoices and logs keep frozen copies of customer/vehicle details.'
              : 'The record stays active. Tell the requester why deletion was declined.' }}
          </p>
          <p style="margin:0 0 12px;">
            <b>{{ modalRow.entityLabel }}</b> — {{ deletionEntityLabel(modalRow.entityType) }}
          </p>
          <p style="font-size:13px; color:#64748b; margin:0 0 12px;">Reason: {{ modalRow.reason }}</p>
          <label class="fld">
            <span>{{ modalMode === 'reject' ? 'Rejection reason' : 'Admin note (optional)' }}</span>
            <textarea
              v-model="modalReason"
              rows="4"
              :placeholder="modalMode === 'reject' ? 'Required — visible in audit log' : 'Optional internal note'"
            />
          </label>
          <p v-if="actionError" style="color:#f87171; font-size:13px; margin:8px 0 0;">{{ actionError }}</p>
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button
              type="button"
              class="btn primary"
              :disabled="busyId === modalRow.id"
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
.modrow {
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  align-items: flex-start;
}
.modrow:last-child { border-bottom: none; }
.modrow .nm { flex: 1; min-width: 0; }
.modrow .nm b { display: block; font-size: 14px; }
.modrow .nm small { color: #94a3b8; font-size: 12px; }
.modrow .acts { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
</style>
