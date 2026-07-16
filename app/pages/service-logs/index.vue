<script setup lang="ts">
// Service logs list + review queue (mockup: PAGE: SERVICE LOGS).
import { windowedPagerPages, listRangeLabel } from '~/utils/pager-ui'

definePageMeta({ layout: 'staff', permission: ['service_logs.read.all', 'service_logs.read.own'] })

interface VehicleBits {
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
}

interface ServiceLogRow {
  id: string
  logNumber: number
  status: string
  workType: string
  customerName: string
  submitterName: string
  createdAt: string
  fileCount: number
  invoiceId: string | null
  vehicle: VehicleBits
  canSendToInvoice?: boolean
  canRevertInvoice?: boolean
}

const auth = useAuthStore()
const canUpload = computed(() => auth.can('service_logs.upload.own'))
const canReview = computed(() => auth.can('service_logs.review.all'))
const isMechanicScope = computed(() => !auth.can('service_logs.read.all') && auth.can('service_logs.read.own'))

const q = ref('')
const fView = ref<'all' | 'review'>('all')
const fSort = ref<'newest' | 'oldest' | 'status'>('newest')
const page = ref(1)
const PAGE_SIZE = 25

watch([q, fView, fSort], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  queue: canReview.value && fView.value === 'review' ? 'review' as const : undefined,
  sort: fSort.value,
}))

const actionBusyId = ref<string | null>(null)
const actionError = ref('')

async function sendToInvoice(log: ServiceLogRow, event?: Event) {
  event?.stopPropagation()
  if (!log.canSendToInvoice || actionBusyId.value) return
  actionBusyId.value = log.id
  actionError.value = ''
  try {
    await $fetch(`/api/service-logs/${log.id}/convert-to-invoice`, { method: 'POST', body: {} })
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Send to invoice failed'
  }
  finally {
    actionBusyId.value = null
  }
}

async function undoSendToInvoice(log: ServiceLogRow, event?: Event) {
  event?.stopPropagation()
  if (!log.canRevertInvoice || actionBusyId.value) return
  actionBusyId.value = log.id
  actionError.value = ''
  try {
    await $fetch(`/api/service-logs/${log.id}/revert-invoice`, { method: 'POST' })
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Undo failed'
  }
  finally {
    actionBusyId.value = null
  }
}

const { data, refresh } = useClientFetch<{ items: ServiceLogRow[], total: number }>(
  '/api/service-logs',
  { query },
)

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const pagerPages = computed(() => windowedPagerPages(page.value, pageCount.value))
const rangeLabel = computed(() => listRangeLabel(page.value, PAGE_SIZE, total.value))
const pageTitle = computed(() => isMechanicScope.value ? 'My Service Logs' : 'Service Logs')

const filtersDirty = computed(() =>
  fView.value !== 'all' || fSort.value !== 'newest' || !!q.value,
)

function clearFilters() {
  q.value = ''
  fView.value = 'all'
  fSort.value = 'newest'
}

const listCountLabel = computed(() => {
  if (!total.value) return 'No service logs'
  const prefix = isMechanicScope.value
    ? 'My logs'
    : fView.value === 'review'
      ? 'Review queue'
      : 'All logs'
  return `${prefix} · ${total.value}`
})

const pageSubtitle = computed(() => {
  if (isMechanicScope.value) return 'Your field uploads — send to invoice when ready'
  if (fView.value === 'review') return 'Logs awaiting accountant action before invoicing'
  return 'All field service logs — including those already linked to invoices'
})

function openLog(id: string) {
  navigateTo(`/service-logs/${id}`)
}
</script>

<template>
  <section class="page active">
    <StaffPageHead :subtitle="pageSubtitle">
      <template #title>{{ pageTitle }}</template>
      <template v-if="canUpload" #actions>
        <NuxtLink to="/service-logs/new" class="btn primary" @click="armWizardSpeechFromCreateClick">+ New service log</NuxtLink>
      </template>
    </StaffPageHead>

    <ListFilterBar
      v-model:search="q"
      search-placeholder="Search service logs…"
      search-aria-label="Search service logs"
      :count-label="listCountLabel"
      :filters-active="filtersDirty"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <label v-if="canReview && !isMechanicScope" class="fld">
          View
          <select v-model="fView" aria-label="Service log view">
            <option value="all">All logs</option>
            <option value="review">Review queue</option>
          </select>
        </label>
        <label class="fld">
          Sort by
          <select v-model="fSort" aria-label="Sort service logs">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="status">Status</option>
          </select>
        </label>
      </template>
    </ListFilterBar>

    <p v-if="actionError" class="help" style="color:#dc2626; margin:0 0 12px;">{{ actionError }}</p>

    <div class="card">
      <div v-if="items.length" id="log-queue">
        <div
          v-for="log in items"
          :key="log.id"
          class="qitem sl-row"
          style="cursor:pointer"
          @click="openLog(log.id)"
        >
          <div class="thumb">{{ log.fileCount ? '🖼' : '📄' }}</div>
          <div class="info">
            <b>{{ logTitle(log.logNumber, log.vehicle, log.workType) }}</b>
            <div class="sub">{{ logSubtitle(log.customerName, log.createdAt, log.submitterName, log.fileCount) }}</div>
            <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <span :class="serviceLogStatusPill(log.status as ServiceLogStatus, { invoiceId: log.invoiceId }).cls">
                {{ serviceLogStatusPill(log.status as ServiceLogStatus, { invoiceId: log.invoiceId }).label }}
              </span>
              <span v-if="log.customerRequested" class="pill info">{{ CUSTOMER_REQUESTED_SERVICE_NOTE }}</span>
            </div>
          </div>
          <div class="qa" @click.stop>
            <template v-if="log.canSendToInvoice">
              <button
                class="btn sm primary"
                type="button"
                :disabled="actionBusyId === log.id"
                @click="sendToInvoice(log, $event)"
              >
                {{ actionBusyId === log.id ? 'Sending…' : 'Send to invoice' }}
              </button>
              <button class="btn sm" type="button" @click="openLog(log.id)">Open</button>
            </template>
            <template v-else-if="log.canRevertInvoice">
              <button
                class="btn sm"
                type="button"
                :disabled="actionBusyId === log.id"
                @click="undoSendToInvoice(log, $event)"
              >
                {{ actionBusyId === log.id ? 'Undoing…' : 'Undo send' }}
              </button>
              <NuxtLink
                v-if="log.invoiceId"
                :to="`/invoices/${log.invoiceId}`"
                class="btn sm"
                @click.stop
              >
                View invoice
              </NuxtLink>
            </template>
            <template v-else-if="log.status === 'converted_to_invoice' && log.invoiceId">
              <NuxtLink :to="`/invoices/${log.invoiceId}`" class="btn sm" @click.stop>View invoice</NuxtLink>
            </template>
            <template v-else>
              <button class="btn sm" type="button" @click="openLog(log.id)">View log</button>
            </template>
          </div>
        </div>
      </div>
      <div v-else id="log-queue-empty" class="empty">No service logs match your search.</div>

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
  </section>
</template>
