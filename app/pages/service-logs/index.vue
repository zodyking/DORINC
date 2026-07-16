<script setup lang="ts">
// Service logs list + review queue (mockup: PAGE: SERVICE LOGS).
import { windowedPagerPages, listRangeLabel } from '~/utils/pager-ui'
import { serviceLogInvoicePreviewPdfHref } from '~/utils/invoice-pdf'

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
  serviceDate: string
  customerName: string
  submitterName: string
  createdAt: string
  fileCount: number
  invoiceId: string | null
  invoiceNumberFormatted: string | null
  customerRequested: boolean
  vehicle: VehicleBits | null
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

function vehicleLabel(vehicle: VehicleBits | null): string {
  if (!vehicle) return '—'
  return vehicleTag(vehicle)
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
      <div class="tscroll">
        <table v-if="items.length" class="tbl sl-list-tbl">
          <thead>
            <tr>
              <th class="col-log">Log</th>
              <th class="col-customer">Customer</th>
              <th class="col-vehicle">Vehicle</th>
              <th class="col-date">Service date</th>
              <th class="col-work">Work</th>
              <th class="col-status">Status</th>
              <th class="col-invoice">Invoice</th>
              <th class="col-actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody id="log-queue">
            <tr
              v-for="log in items"
              :key="log.id"
              class="click sl-list-row"
              @click="openLog(log.id)"
            >
              <td class="col-log" data-label="Log">
                <span class="lead">{{ logNumberDisplay(log.logNumber) }}</span>
                <span v-if="log.fileCount" class="sub">{{ log.fileCount === 1 ? '1 photo' : `${log.fileCount} photos` }}</span>
              </td>
              <td class="col-customer" data-label="Customer">
                <span class="lead">{{ log.customerName }}</span>
                <span class="sub">{{ log.submitterName }}</span>
              </td>
              <td class="col-vehicle" data-label="Vehicle">
                <span class="lead">{{ vehicleLabel(log.vehicle) }}</span>
                <span v-if="log.vehicle" class="sub">{{ vehicleSub(log.vehicle) }}</span>
              </td>
              <td class="col-date" data-label="Service date">
                {{ serviceLogServiceDateDisplay(log.serviceDate) }}
              </td>
              <td class="col-work" data-label="Work">
                {{ workTypeLabel(log.workType) }}
              </td>
              <td class="col-status" data-label="Status">
                <div class="sl-list-badges">
                  <span :class="serviceLogStatusPill(log.status as ServiceLogStatus, { invoiceId: log.invoiceId }).cls">
                    {{ serviceLogStatusPill(log.status as ServiceLogStatus, { invoiceId: log.invoiceId }).label }}
                  </span>
                  <span v-if="log.customerRequested" class="pill info sl-list-cust-req">Customer request</span>
                </div>
              </td>
              <td class="col-invoice" data-label="Invoice">
                <a
                  v-if="log.invoiceId && log.invoiceNumberFormatted"
                  :href="serviceLogInvoicePreviewPdfHref(log.id)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="sl-inv-pdf-link"
                  :title="`Open ${log.invoiceNumberFormatted} PDF in a new tab`"
                  @click.stop
                >
                  {{ log.invoiceNumberFormatted }}
                  <span class="sl-inv-pdf-icon" aria-hidden="true">↗</span>
                </a>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-actions" data-label="Actions">
                <div class="sl-list-actions" @click.stop>
                  <template v-if="log.canSendToInvoice">
                    <button
                      type="button"
                      class="btn sm primary"
                      :disabled="actionBusyId === log.id"
                      @click="sendToInvoice(log, $event)"
                    >
                      {{ actionBusyId === log.id ? 'Sending…' : 'Send to invoice' }}
                    </button>
                    <button type="button" class="btn sm" @click="openLog(log.id)">Open</button>
                  </template>
                  <template v-else-if="log.canRevertInvoice">
                    <button
                      type="button"
                      class="btn sm"
                      :disabled="actionBusyId === log.id"
                      @click="undoSendToInvoice(log, $event)"
                    >
                      {{ actionBusyId === log.id ? 'Undoing…' : 'Undo send' }}
                    </button>
                    <NuxtLink
                      v-if="log.invoiceId"
                      :to="`/invoices/${log.invoiceId}`"
                      class="btn sm"
                    >
                      View invoice
                    </NuxtLink>
                  </template>
                  <template v-else-if="log.status === 'converted_to_invoice' && log.invoiceId">
                    <NuxtLink :to="`/invoices/${log.invoiceId}`" class="btn sm">View invoice</NuxtLink>
                  </template>
                  <template v-else>
                    <button type="button" class="btn sm" @click="openLog(log.id)">View log</button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else id="log-queue-empty" class="empty">No service logs match your search.</div>
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
  </section>
</template>

<style scoped>
.sl-list-tbl .col-log { width: 8%; min-width: 88px; }
.sl-list-tbl .col-customer { width: 18%; min-width: 140px; }
.sl-list-tbl .col-vehicle { width: 18%; min-width: 140px; }
.sl-list-tbl .col-date { width: 11%; min-width: 108px; white-space: nowrap; }
.sl-list-tbl .col-work { width: 14%; min-width: 120px; }
.sl-list-tbl .col-status { width: 14%; min-width: 130px; }
.sl-list-tbl .col-invoice { width: 11%; min-width: 100px; }
.sl-list-tbl .col-actions { width: 12%; min-width: 120px; text-align: right; }

.sl-list-tbl .lead {
  display: block;
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
}

.sl-list-tbl .sub {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.35;
}

.sl-list-badges {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.sl-list-cust-req {
  font-size: 10px;
  padding: 1px 7px;
}

.sl-inv-pdf-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 13px;
  color: #4f46e5;
  text-decoration: none;
}

.sl-inv-pdf-link:hover {
  text-decoration: underline;
  color: #4338ca;
}

.sl-inv-pdf-icon {
  font-size: 11px;
  opacity: 0.85;
}

.sl-list-row td.col-actions {
  vertical-align: middle;
}

.sl-list-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

@media (max-width: 960px) {
  .sl-list-tbl thead {
    display: none;
  }

  .sl-list-tbl tbody tr {
    display: block;
    padding: 14px 16px;
    border-bottom: 1px solid #f1f5f9;
  }

  .sl-list-tbl tbody tr:last-child {
    border-bottom: none;
  }

  .sl-list-tbl td {
    display: grid;
    grid-template-columns: 108px 1fr;
    gap: 4px 12px;
    padding: 4px 0;
    border: none;
  }

  .sl-list-tbl td::before {
    content: attr(data-label);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .sl-list-tbl td.col-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
  }

  .sl-list-tbl td.col-actions::before {
    display: none;
  }
}
</style>
