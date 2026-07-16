<script setup lang="ts">
// Invoices list — KPI cards, status chips, filters, table (mockup: PAGE: INVOICES).
import InvoiceListRowActions from '~/components/invoices/InvoiceListRowActions.vue'
import {
  invoiceDateDisplay,
  invoiceStatusPill,
  moneyDisplay,
  vehicleSnapshotSub,
  type InvoiceStatus,
  type InvoiceVehicleSnapshotDisplay,
} from '~/utils/invoices-ui'
import { logNumberDisplay } from '~/utils/service-logs-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { formatPersonNameShort } from '#shared/format/person-name'

definePageMeta({ layout: 'staff', permission: 'invoices.read.all' })

type StatusChip = 'all' | 'draft' | 'pending_manager_approval' | 'sent' | 'overdue' | 'paid'

interface InvoiceRow {
  id: string
  invoiceNumber: number
  invoiceNumberFormatted: string
  status: InvoiceStatus
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  customerName: string
  vehicleSnapshot: InvoiceVehicleSnapshotDisplay | null
  creationSource?: string
  serviceLogId: string | null
  serviceLogNumber: number | null
  serviceLogSubmitterName: string | null
  serviceLogPhotoCount: number
}

interface InvoiceStats {
  total: number
  draftCount: number
  pendingManagerApprovalCount?: number
  sentCount: number
  paidCount: number
  overdueCount: number
  outstandingTotal: string
  outstandingCount: number
  paidThisMonthTotal: string
  overdueTotal: string
}

const route = useRoute()
const auth = useAuthStore()
const canRead = computed(() => auth.loaded && auth.can('invoices.read.all'))
const canCreate = computed(() => auth.can('invoices.create.all'))
const canSend = computed(() => auth.can('invoices.send.all'))

const q = ref('')
const fStatus = ref<StatusChip>((route.query.status as StatusChip) || 'all')
const fSort = ref<'newest' | 'oldest' | 'invoice_date' | 'status'>('newest')
const page = ref(1)
const PAGE_SIZE = 25

watch([q, fStatus, fSort], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  status: fStatus.value === 'all' || fStatus.value === 'overdue'
    ? undefined
    : fStatus.value,
  overdue: fStatus.value === 'overdue' ? true : undefined,
  sort: fSort.value,
}))

// Client-only fetches — do not await (Suspense blank) and do not refresh during SSR
// (server:false refresh on the server never completes, leaving pending stuck after hydrate).
const {
  data: stats,
  refresh: refreshStats,
  error: statsError,
  pending: statsPending,
} = useFetch<InvoiceStats>('/api/invoices/stats', {
  server: false,
  lazy: true,
  immediate: false,
})

const {
  data,
  refresh: refreshList,
  error: listError,
  pending: listPending,
} = useFetch<{ items: InvoiceRow[], total: number }>('/api/invoices', {
  query,
  server: false,
  lazy: true,
  immediate: false,
})

function loadInvoices() {
  if (!import.meta.client) return
  if (!auth.loaded || !auth.can('invoices.read.all')) return
  void refreshStats()
  void refreshList()
}

onMounted(() => {
  loadInvoices()
})

watch(canRead, (allowed) => {
  if (allowed) loadInvoices()
})

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const pagerPages = computed(() => {
  const count = pageCount.value
  if (count <= 12) return Array.from({ length: count }, (_, i) => i + 1)
  const current = page.value
  const start = Math.max(1, Math.min(current - 4, count - 11))
  const end = Math.min(count, start + 11)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})
const pageError = computed(() =>
  (listError.value as { data?: { message?: string } } | null)?.data?.message
  ?? (statsError.value as { data?: { message?: string } } | null)?.data?.message
  ?? (listError.value ? 'Could not load invoices' : null)
  ?? (statsError.value ? 'Could not load invoice stats' : null),
)

const chips = computed(() => [
  { key: 'all' as const, label: 'All', count: stats.value?.total ?? 0 },
  { key: 'draft' as const, label: 'Draft', count: stats.value?.draftCount ?? 0 },
  { key: 'pending_manager_approval' as const, label: 'Pending approval', count: stats.value?.pendingManagerApprovalCount ?? 0 },
  { key: 'sent' as const, label: 'Sent', count: stats.value?.sentCount ?? 0 },
  { key: 'overdue' as const, label: 'Overdue', count: stats.value?.overdueCount ?? 0 },
  { key: 'paid' as const, label: 'Paid', count: stats.value?.paidCount ?? 0 },
])

const filtersDirty = computed(() =>
  fStatus.value !== 'all' || fSort.value !== 'newest' || !!q.value,
)

function clearFilters() {
  q.value = ''
  fStatus.value = 'all'
  fSort.value = 'newest'
}

const listCountLabel = computed(() => {
  if (listPending.value || statsPending.value) return 'Loading…'
  if (!total.value) return 'No invoices'
  return rangeLabel.value
})

const rangeLabel = computed(() => {
  if (!total.value) return 'No invoices'
  const from = (page.value - 1) * PAGE_SIZE + 1
  const to = Math.min(page.value * PAGE_SIZE, total.value)
  return `Showing ${from}—${to} of ${total.value}`
})

const subtitle = computed(() => {
  const n = stats.value?.total ?? 0
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return `${n} invoice${n === 1 ? '' : 's'} · ${month}`
})

function openInvoice(id: string) {
  navigateTo(`/invoices/${id}`)
}

function openServiceLog(event: Event, serviceLogId: string) {
  event.stopPropagation()
  navigateTo(`/service-logs/${serviceLogId}`)
}

const SERVICE_LOG_HIGHLIGHT_STATUSES = new Set<InvoiceStatus>(['draft', 'pending_manager_approval'])

function showServiceLogHighlight(row: InvoiceRow): boolean {
  return !!row.serviceLogId && SERVICE_LOG_HIGHLIGHT_STATUSES.has(row.status)
}

function serviceLogSubmitterLabel(name: string | null | undefined): string | null {
  if (!name?.trim()) return null
  const short = formatPersonNameShort(name)
  return short ? `By ${short}` : null
}

async function retryLoad() {
  await Promise.all([refreshList(), refreshStats()])
}

const exportBusy = ref(false)
const exportError = ref('')

async function exportCsv() {
  exportBusy.value = true
  exportError.value = ''
  try {
    const params = new URLSearchParams()
    if (q.value.trim()) params.set('q', q.value.trim())
    if (fStatus.value === 'overdue') params.set('overdue', 'true')
    else if (fStatus.value !== 'all') params.set('status', fStatus.value)
    if (fSort.value !== 'newest') params.set('sort', fSort.value)

    const query = params.toString()
    const blob = await $fetch<Blob>(`/api/invoices/export${query ? `?${query}` : ''}`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  catch (e: unknown) {
    exportError.value = syncFetchErrorMessage(e, 'Could not export invoices')
  }
  finally {
    exportBusy.value = false
  }
}
</script>

<template>
  <section v-if="auth.loaded && !canRead" class="page active">
    <div class="cp-state">You do not have permission to view invoices.</div>
  </section>

  <section v-else class="page active">
    <StaffPageHead :subtitle="auth.loaded ? subtitle : 'Loading…'">
      <template #title>Invoices</template>
      <template #actions>
        <NuxtLink v-if="canCreate" to="/invoices/new" class="btn primary" @click="armWizardSpeechFromCreateClick">+ New Invoice</NuxtLink>
        <BulkSendInvoicesButton v-if="canSend" @sent="retryLoad" />
        <button type="button" class="btn" :disabled="exportBusy" @click="exportCsv">
          {{ exportBusy ? 'Exporting…' : 'Export CSV' }}
        </button>
      </template>
    </StaffPageHead>

    <div v-if="exportError" class="card" style="padding:12px 16px; margin-bottom:16px;">
      <p style="margin:0; color:#dc2626;">{{ exportError }}</p>
    </div>

    <div v-if="pageError" class="card" style="padding:20px; margin-bottom:16px;">
      <p style="margin:0 0 12px; color:#dc2626;">{{ pageError }}</p>
      <button type="button" class="btn" @click="retryLoad">Retry</button>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="t">Outstanding</div>
        <div class="v">{{ moneyDisplay(stats?.outstandingTotal) }}</div>
        <div class="d flat">{{ stats?.outstandingCount ?? 0 }} open invoice{{ (stats?.outstandingCount ?? 0) === 1 ? '' : 's' }}</div>
      </div>
      <div class="kpi">
        <div class="t">Paid this month</div>
        <div class="v">{{ moneyDisplay(stats?.paidThisMonthTotal) }}</div>
        <div class="d up">Payments received</div>
      </div>
      <div class="kpi">
        <div class="t">Overdue</div>
        <div class="v">{{ moneyDisplay(stats?.overdueTotal) }}</div>
        <div class="d down">{{ stats?.overdueCount ?? 0 }} past due</div>
      </div>
      <div class="kpi">
        <div class="t">Drafts</div>
        <div class="v">{{ stats?.draftCount ?? 0 }}</div>
        <div class="d flat">Awaiting finalize</div>
      </div>
    </div>

    <ListFilterBar
      v-model:search="q"
      search-placeholder="Search invoices, customers…"
      search-aria-label="Search invoices"
      :count-label="listCountLabel"
      :filters-active="filtersDirty"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <label class="fld">
          Status
          <select v-model="fStatus" aria-label="Invoice status">
            <option v-for="chip in chips" :key="chip.key" :value="chip.key">
              {{ chip.label }} · {{ chip.count }}
            </option>
          </select>
        </label>
        <label class="fld">
          Sort by
          <select v-model="fSort" aria-label="Sort invoices">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="invoice_date">Invoice date</option>
            <option value="status">Status</option>
          </select>
        </label>
      </template>
    </ListFilterBar>

    <div class="card">
      <div class="tscroll">
        <table v-if="items.length" class="tbl inv-tbl">
          <thead>
            <tr>
              <th class="col-inv">Invoice</th>
              <th class="col-cust">Customer / Vehicle</th>
              <th class="col-issued">Issued</th>
              <th class="col-due">Due</th>
              <th class="col-status">Status</th>
              <th class="num col-amt">Amount</th>
              <th class="col-actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody id="inv-rows">
            <tr
              v-for="row in items"
              :key="row.id"
              class="click"
              :class="{ 'inv-from-sl-pulse': showServiceLogHighlight(row) }"
              @click="openInvoice(row.id)"
            >
              <td class="col-inv">
                <span class="lead">{{ row.invoiceNumberFormatted }}</span>
                <span
                  v-if="showServiceLogHighlight(row) && serviceLogSubmitterLabel(row.serviceLogSubmitterName)"
                  class="inv-sl-submitter"
                >
                  {{ serviceLogSubmitterLabel(row.serviceLogSubmitterName) }}
                </span>
                <span
                  v-if="row.serviceLogId && row.serviceLogNumber"
                  class="inv-source-row"
                >
                  <button
                    type="button"
                    class="inv-source-link"
                    @click="openServiceLog($event, row.serviceLogId!)"
                  >
                    {{ logNumberDisplay(row.serviceLogNumber) }}
                  </button>
                  <span
                    v-if="row.serviceLogPhotoCount > 0"
                    class="pill info inv-photo-pill"
                  >
                    {{ row.serviceLogPhotoCount === 1 ? '1 photo' : `${row.serviceLogPhotoCount} photos` }}
                  </span>
                </span>
              </td>
              <td class="col-cust">
                {{ row.customerName }}
                <span class="sub">{{ vehicleSnapshotSub(row.vehicleSnapshot) }}</span>
              </td>
              <td class="col-issued">{{ invoiceDateDisplay(row.invoiceDate) }}</td>
              <td class="col-due">{{ invoiceDateDisplay(row.dueDate) }}</td>
              <td class="col-status">
                <span :class="invoiceStatusPill(row.status, row.dueDate, row.balanceDue).cls">
                  {{ invoiceStatusPill(row.status, row.dueDate, row.balanceDue).label }}
                </span>
              </td>
              <td class="num col-amt">{{ moneyDisplay(row.total) }}</td>
              <td class="col-actions">
                <InvoiceListRowActions
                  :invoice-id="row.id"
                  :invoice-label="row.invoiceNumberFormatted"
                  :status="row.status"
                  @changed="retryLoad"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="listPending || statsPending" id="inv-rows-empty" class="empty">Loading invoices…</div>
        <div v-else-if="pageError" id="inv-rows-empty" class="empty">Could not load invoices.</div>
        <div v-else id="inv-rows-empty" class="empty">No invoices match your search.</div>
      </div>

      <div class="cfoot">
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
