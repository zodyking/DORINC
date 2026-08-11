<script setup lang="ts">
import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'
import {
  DELETION_ENTITY_TABS,
  deletionEntityLabel,
  deletionRequestApproveHint,
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
  aiReviewedAt: string | null
  aiReviewNote: string | null
  createdAt: string
  entityHref: string
}

type ViewMode = 'queue' | 'log'
type ModalStep = 'review' | 'accept' | 'reject'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const canReview = computed(() => auth.can('deletion_requests.review.all'))

const highlightRequestId = computed(() =>
  typeof route.query.request === 'string' ? route.query.request : '',
)

const view = ref<ViewMode>(highlightRequestId.value ? 'queue' : 'queue')
const tab = ref<'all' | DeletionEntityType>('all')
const logStatus = ref<'decided' | 'approved' | 'rejected'>('decided')
const q = ref('')
const page = ref(1)
const PAGE_SIZE = 25

if (highlightRequestId.value) {
  view.value = 'queue'
}

watch([view, tab, logStatus, q], () => { page.value = 1 })

watch(view, (next) => {
  if (next === 'queue') page.value = 1
})

const queryStatus = computed(() => {
  if (highlightRequestId.value) return 'all' as const
  return view.value === 'queue' ? 'pending' as const : logStatus.value
})

const query = computed(() => ({
  entityType: tab.value === 'all' ? undefined : tab.value,
  status: queryStatus.value,
  requestId: highlightRequestId.value || undefined,
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

// Auto-refresh the pending queue while Susan (or a reviewer) may still decide.
let pendingPollTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  pendingPollTimer = setInterval(() => {
    if (view.value === 'queue' && pendingCount.value > 0 && !loading.value) {
      void refresh()
    }
  }, 5_000)
})
onUnmounted(() => {
  if (pendingPollTimer) clearInterval(pendingPollTimer)
  pendingPollTimer = null
})
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

const busyId = ref('')
const modalOpen = ref(false)
const modalStep = ref<ModalStep>('review')
const modalRow = ref<DeletionRequestRow | null>(null)
const modalReason = ref('')
const actionError = ref('')
const deepLinkHandled = ref(false)

function openReview(row: DeletionRequestRow) {
  modalRow.value = row
  modalStep.value = 'review'
  modalReason.value = ''
  actionError.value = ''
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalRow.value = null
  modalStep.value = 'review'
  if (highlightRequestId.value) {
    const { request: _request, ...rest } = route.query
    void router.replace({ query: rest })
  }
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

async function submitDecision(action: 'approve' | 'reject') {
  const row = modalRow.value
  if (!row) return
  if (action === 'reject' && modalReason.value.trim().length < 3) {
    actionError.value = 'A rejection reason is required.'
    return
  }

  busyId.value = row.id
  actionError.value = ''
  try {
    const path = `/api/deletion-requests/${row.id}/${action}`
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

watch([items, highlightRequestId], () => {
  if (!highlightRequestId.value || !items.value.length || deepLinkHandled.value) return
  const row = items.value.find(r => r.id === highlightRequestId.value)
  if (!row) return
  deepLinkHandled.value = true
  view.value = row.status === 'pending' ? 'queue' : 'log'
  openReview(row)
}, { immediate: true })
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Staff requests to permanently delete records — review and decide here">
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
      <div class="req-view-bar">
        <div class="req-view-toggle" role="tablist" aria-label="Deletion request views">
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
          {{ view === 'queue' ? 'No pending deletion requests.' : 'No past deletion decisions match this filter.' }}
        </div>

        <div v-else-if="view === 'queue'" id="deletion-req-queue">
          <div
            v-for="row in items"
            :id="`deletion-req-${row.id}`"
            :key="row.id"
            class="req-row"
          >
            <span class="av" :class="avColor(row.entityLabel)">{{ initials(row.entityLabel) }}</span>
            <div class="req-row__main">
              <div class="req-row__title">
                <b>{{ row.entityLabel }}</b>
                <span :class="deletionRequestTypeBadge(row.entityType).cls">
                  {{ deletionRequestTypeBadge(row.entityType).label }}
                </span>
                <span :class="deletionStatusPill(row.status).cls">{{ deletionStatusPill(row.status).label }}</span>
              </div>
              <p class="req-row__meta">
                {{ deletionEntityLabel(row.entityType) }}
                · {{ deletionRequestSubmitter(row.submittedByName, row.submittedByEmail) }}
                · {{ deletionWhen(row.createdAt) }}
              </p>
              <div class="req-row__preview">{{ deletionRequestPreviewText(row.reason) }}</div>
              <p v-if="row.aiReviewNote" class="req-row__meta" style="margin-top:6px;">
                Susan note · {{ deletionRequestPreviewText(row.aiReviewNote) }}
              </p>
              <div class="req-row__links">
                <NuxtLink :to="row.entityHref" class="link">View record</NuxtLink>
                <span v-if="row.aiReviewedAt" class="pill" style="margin-left:8px;">Awaiting human</span>
              </div>
            </div>
            <div class="req-row__acts">
              <button
                class="btn sm primary"
                type="button"
                :disabled="busyId === row.id"
                @click="openReview(row)"
              >
                Review
              </button>
            </div>
          </div>
        </div>

        <div v-else class="tscroll">
          <table id="deletion-req-log" class="tbl audit-tbl req-log-tbl">
            <thead>
              <tr>
                <th class="col-when">Requested</th>
                <th>Record</th>
                <th>Submitted by</th>
                <th class="col-decision">Decision</th>
                <th>Reviewed</th>
                <th class="col-detail">Note</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in items" :key="row.id">
                <td class="col-when mono">{{ deletionWhen(row.createdAt) }}</td>
                <td>
                  <b>{{ row.entityLabel }}</b>
                  <div class="muted">{{ deletionEntityLabel(row.entityType) }}</div>
                </td>
                <td>{{ deletionRequestSubmitter(row.submittedByName, row.submittedByEmail) }}</td>
                <td class="col-decision">
                  <span :class="deletionStatusPill(row.status).cls">
                    {{ row.status === 'approved' ? 'Accepted' : deletionStatusPill(row.status).label }}
                  </span>
                </td>
                <td>
                  <div>{{ row.reviewedByName || '—' }}</div>
                  <div class="muted">{{ row.reviewedAt ? deletionWhen(row.reviewedAt) : '—' }}</div>
                </td>
                <td class="col-detail">{{ row.reviewReason || row.reason || '—' }}</td>
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
      <div class="modal req-modal" role="dialog" aria-modal="true" aria-labelledby="deletion-review-title" @click.stop>
        <div class="mhead">
          <div>
            <h3 id="deletion-review-title">
              {{
                modalStep === 'accept'
                  ? 'Accept deletion'
                  : modalStep === 'reject'
                    ? 'Reject request'
                    : 'Review deletion request'
              }}
            </h3>
            <p v-if="modalStep === 'review' && modalRow.status === 'pending'">
              Review the request, then accept or reject.
            </p>
            <p v-else-if="modalStep === 'review'">
              This request was already {{ modalRow.status === 'approved' ? 'accepted' : 'declined' }}.
            </p>
            <p v-else-if="modalStep === 'accept'">{{ deletionRequestApproveHint(modalRow.entityType) }}</p>
            <p v-else>The record stays active. Tell the requester why deletion was declined.</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeModal">×</button>
        </div>

        <div class="mbody req-modal__grid">
          <div class="req-modal__panel">
            <p class="req-modal__kicker">Record</p>
            <p class="req-modal__title">{{ modalRow.entityLabel }}</p>
            <p class="req-modal__meta">
              {{ deletionEntityLabel(modalRow.entityType) }}
              · {{ deletionRequestSubmitter(modalRow.submittedByName, modalRow.submittedByEmail) }}
              · {{ deletionWhen(modalRow.createdAt) }}
            </p>
          </div>

          <div class="req-modal__panel">
            <p class="req-modal__kicker">Deletion reason</p>
            <p class="req-modal__body-text">{{ deletionRequestPreviewText(modalRow.reason) }}</p>
          </div>

          <div class="req-modal__links">
            <NuxtLink :to="modalRow.entityHref" class="link">Open record</NuxtLink>
            <span :class="deletionStatusPill(modalRow.status).cls">{{ deletionStatusPill(modalRow.status).label }}</span>
          </div>

          <p v-if="modalStep === 'accept'" class="callout info">
            {{ deletionRequestOutcomeSummary(modalRow.entityType) }}
          </p>

          <label v-if="modalStep === 'accept' || modalStep === 'reject'" class="fld">
            <span>{{ modalStep === 'reject' ? 'Rejection reason' : 'Staff note (optional)' }}</span>
            <textarea
              v-model="modalReason"
              rows="4"
              :required="modalStep === 'reject'"
              :placeholder="modalStep === 'reject' ? 'Required — visible in the decision log' : 'Optional internal note'"
            />
          </label>

          <p v-if="modalRow.reviewReason && modalRow.status !== 'pending'" class="req-modal__foot-note">
            Staff note{{ modalRow.reviewedByName ? ` (${modalRow.reviewedByName})` : '' }}: {{ modalRow.reviewReason }}
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
            :disabled="busyId === modalRow.id"
            @click="submitDecision('approve')"
          >
            Confirm deletion
          </button>
          <button
            v-else-if="modalStep === 'reject'"
            type="button"
            class="btn primary"
            :disabled="busyId === modalRow.id"
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
