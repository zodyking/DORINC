<script setup lang="ts">
// Service logs list + review queue (mockup: PAGE: SERVICE LOGS).
import ServiceLogListRowActions from '~/components/service-logs/ServiceLogListRowActions.vue'
import ServiceLogSheetEditorModal from '~/components/service-logs/ServiceLogSheetEditorModal.vue'
import { windowedPagerPages, listRangeLabel } from '~/utils/pager-ui'
import { serviceLogInvoicePreviewPdfHref, openServiceLogInvoicePdf } from '~/utils/invoice-pdf'
import { fetchServiceLogSheetPdf } from '~/utils/service-log-sheet'
import { PdfViewerDialog } from '~/utils/pdf-viewer'
import { fetchErrorMessage, syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  serviceLogInvoiceLinkStatusClass,
  type ServiceLogInvoiceLinkStatus,
} from '~/utils/service-log-invoice-status'
import { vehicleTag, type VehicleDisplay } from '~/utils/vehicles-ui'

definePageMeta({ layout: 'staff', permission: ['service_logs.read.all', 'service_logs.read.own'] })

type VehiclePick = VehicleDisplay & { id: string }

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
  invoiceLinkStatus: ServiceLogInvoiceLinkStatus | null
  customerRequested: boolean
  vehicle: VehicleBits | null
  canSendToInvoice?: boolean
  canRevertInvoice?: boolean
  canMarkReady?: boolean
}

const auth = useAuthStore()
const canUpload = computed(() => auth.can('service_logs.upload.own'))
const canReview = computed(() => auth.can('service_logs.review.all'))
const canEditSheet = computed(() => auth.can('catalog.manage.all'))
const canPrintSheet = computed(() =>
  auth.can('service_logs.read.all')
  || auth.can('service_logs.read.own')
  || auth.can('service_logs.upload.own'),
)
const showPageActions = computed(() => canUpload.value || canPrintSheet.value || canEditSheet.value)
const isMechanicScope = computed(() => !auth.can('service_logs.read.all') && auth.can('service_logs.read.own'))
const editSheetOpen = ref(false)
const sheetBusy = ref(false)
const sheetPdfDialogOpen = ref(false)
const sheetPdfBlob = ref<Blob | null>(null)
const { url: sheetPdfUrl, setFromBlob: setSheetPdfBlob, revoke: revokeSheetPdf } = usePdfBlobUrl()

type ServiceLogSort = 'newest' | 'oldest' | 'status' | 'service_date' | 'customer' | 'unit'

const q = ref('')
const fView = ref<'all' | 'review'>('all')
const fSort = ref<ServiceLogSort>('newest')
const fCustomer = ref('all')
const fVehicle = ref('all')
const fDateFrom = ref('')
const fDateTo = ref('')
const page = ref(1)
const PAGE_SIZE = 25

// Reset the vehicle filter whenever the customer changes (vehicles are per-customer).
watch(fCustomer, () => { fVehicle.value = 'all' })

watch([q, fView, fSort, fCustomer, fVehicle, fDateFrom, fDateTo], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  queue: canReview.value && fView.value === 'review' ? 'review' as const : undefined,
  customerId: fCustomer.value === 'all' ? undefined : fCustomer.value,
  vehicleId: fVehicle.value === 'all' ? undefined : fVehicle.value,
  dateFrom: fDateFrom.value || undefined,
  dateTo: fDateTo.value || undefined,
  sort: fSort.value,
}))

const actionError = ref('')

const { data, error, refresh } = useClientFetch<{ items: ServiceLogRow[], total: number }>(
  '/api/service-logs',
  { query },
)

const { data: customersData, pending: customersPending } = useClientFetch<{ items: { id: string, displayName: string }[] }>(
  '/api/customers',
  { query: { pageSize: 100, sort: 'name-asc' as const } },
)
const customerOptions = computed(() => customersData.value?.items ?? [])

// Vehicles load only once a customer is selected (they are per-customer).
const { data: vehiclesData, pending: vehiclesPending } = useClientFetch<{ items: VehiclePick[] }>(
  () => (fCustomer.value === 'all' ? null : '/api/vehicles'),
  { query: computed(() => ({ customerId: fCustomer.value, pageSize: 100, sort: 'tag-asc' as const })) },
)
const vehicleOptions = computed(() => vehiclesData.value?.items ?? [])

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const pagerPages = computed(() => windowedPagerPages(page.value, pageCount.value))
const rangeLabel = computed(() => listRangeLabel(page.value, PAGE_SIZE, total.value))
const pageTitle = computed(() => isMechanicScope.value ? 'My Service Logs' : 'Service Logs')

const filtersDirty = computed(() =>
  fView.value !== 'all' || fSort.value !== 'newest' || !!q.value
  || fCustomer.value !== 'all' || fVehicle.value !== 'all'
  || !!fDateFrom.value || !!fDateTo.value,
)

function clearFilters() {
  q.value = ''
  fView.value = 'all'
  fSort.value = 'newest'
  fCustomer.value = 'all'
  fVehicle.value = 'all'
  fDateFrom.value = ''
  fDateTo.value = ''
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

function onRowActionError(message: string) {
  actionError.value = message
}

async function onRowChanged() {
  actionError.value = ''
  await refresh()
}

function openLog(id: string) {
  navigateTo(`/service-logs/${id}`)
}

function vehicleLabel(vehicle: VehicleBits | null): string {
  if (!vehicle) return '—'
  return vehicleTag(vehicle)
}

/** Customer portal requests stay highlighted until the log is sent to invoice. */
function showCustomerRequestGlow(log: ServiceLogRow): boolean {
  return log.customerRequested && log.status !== 'converted_to_invoice'
}

const pdfOpenBusy = ref<string | null>(null)

async function openInvoicePdf(log: ServiceLogRow, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (pdfOpenBusy.value) return
  pdfOpenBusy.value = log.id
  actionError.value = ''
  try {
    await openServiceLogInvoicePdf(log.id)
  }
  catch (err) {
    actionError.value = syncFetchErrorMessage(err, 'Could not open invoice PDF')
  }
  finally {
    pdfOpenBusy.value = null
  }
}

async function printServiceLogSheet() {
  if (sheetBusy.value) return
  sheetBusy.value = true
  actionError.value = ''
  revokeSheetPdf()
  sheetPdfBlob.value = null
  try {
    const blob = await fetchServiceLogSheetPdf()
    sheetPdfBlob.value = blob
    setSheetPdfBlob(blob)
    sheetPdfDialogOpen.value = true
  }
  catch (err) {
    actionError.value = await fetchErrorMessage(err, 'Could not open service log sheet PDF')
  }
  finally {
    sheetBusy.value = false
  }
}

function closeSheetPdfDialog() {
  sheetPdfDialogOpen.value = false
  sheetPdfBlob.value = null
  revokeSheetPdf()
}
</script>

<template>
  <section class="page active">
    <StaffPageHead :subtitle="pageSubtitle">
      <template #title>{{ pageTitle }}</template>
      <template v-if="showPageActions" #actions>
        <button
          v-if="canPrintSheet"
          type="button"
          class="btn"
          :disabled="sheetBusy"
          @click="printServiceLogSheet"
        >
          {{ sheetBusy ? 'Rendering…' : 'Print Service Log Sheet' }}
        </button>
        <button
          v-if="canEditSheet"
          type="button"
          class="btn"
          @click="editSheetOpen = true"
        >
          Edit Service Log Sheet
        </button>
        <NuxtLink
          v-if="canUpload"
          to="/service-logs/new"
          class="btn primary"
          @click="armWizardSpeechFromCreateClick"
        >
          + New service log
        </NuxtLink>
      </template>
    </StaffPageHead>

    <ServiceLogSheetEditorModal v-model:open="editSheetOpen" />

    <PdfViewerDialog
      v-model:open="sheetPdfDialogOpen"
      :src="sheetPdfUrl"
      :blob="sheetPdfBlob"
      title="Service Log Sheet PDF"
      :download-href="sheetPdfUrl || undefined"
      download-filename="service-log-sheet.pdf"
      @close="closeSheetPdfDialog"
    />

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
        <label v-if="!isMechanicScope" class="fld">
          Customer
          <select v-model="fCustomer" aria-label="Filter by customer">
            <option value="all">All customers</option>
            <option v-for="c in customerOptions" :key="c.id" :value="c.id">{{ c.displayName }}</option>
          </select>
          <span v-if="customersPending" class="help">Loading customers…</span>
        </label>
        <label v-if="!isMechanicScope" class="fld">
          Vehicle / unit
          <select v-model="fVehicle" :disabled="fCustomer === 'all'" aria-label="Filter by vehicle">
            <option value="all">All vehicles</option>
            <option v-for="v in vehicleOptions" :key="v.id" :value="v.id">{{ vehicleTag(v) }}</option>
          </select>
          <span v-if="fCustomer === 'all'" class="help">Select a customer first.</span>
          <span v-else-if="vehiclesPending" class="help">Loading vehicles…</span>
          <span v-else-if="!vehicleOptions.length" class="help">No vehicles for this customer.</span>
        </label>
        <label class="fld">
          Service date from
          <input v-model="fDateFrom" type="date" aria-label="Service date from">
        </label>
        <label class="fld">
          Service date to
          <input v-model="fDateTo" type="date" aria-label="Service date to">
        </label>
        <label class="fld">
          Sort by
          <select v-model="fSort" aria-label="Sort service logs">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="service_date">Service date</option>
            <option value="customer">Customer (A–Z)</option>
            <option value="unit">Unit number</option>
            <option value="status">Status</option>
          </select>
        </label>
      </template>
    </ListFilterBar>

    <p v-if="actionError" class="help" style="color:#dc2626; margin:0 0 12px;">{{ actionError }}</p>
    <p v-else-if="error" class="help" style="color:#dc2626; margin:0 0 12px;">
      Could not load service logs. Try refreshing the page.
    </p>

    <div class="card">
      <div class="tscroll">
        <table v-if="items.length" class="tbl sl-list-tbl">
          <thead>
            <tr>
              <th class="col-log">Log</th>
              <th class="col-customer">Customer</th>
              <th class="col-vehicle">Vehicle</th>
              <th class="col-date">Invoice date</th>
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
              :class="{ 'sl-cust-req-pulse': showCustomerRequestGlow(log) }"
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
              <td class="col-date" data-label="Invoice date">
                {{ serviceLogServiceDateDisplay(log.serviceDate) }}
              </td>
              <td class="col-status" data-label="Status">
                <div class="sl-list-badges">
                  <span :class="serviceLogStatusPill(log.status as ServiceLogStatus, { invoiceId: log.invoiceId, invoiceLinkStatus: log.invoiceLinkStatus }).cls">
                    {{ serviceLogStatusPill(log.status as ServiceLogStatus, { invoiceId: log.invoiceId, invoiceLinkStatus: log.invoiceLinkStatus }).label }}
                  </span>
                  <span v-if="log.customerRequested" class="pill info sl-list-cust-req">Customer request</span>
                </div>
              </td>
              <td class="col-invoice" data-label="Invoice">
                <div v-if="log.invoiceId && log.invoiceNumberFormatted" class="sl-inv-cell">
                  <a
                    :href="serviceLogInvoicePreviewPdfHref(log.id)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="sl-inv-pdf-link"
                    :title="`Open ${log.invoiceNumberFormatted} PDF in a new tab`"
                    :aria-busy="pdfOpenBusy === log.id"
                    @click="openInvoicePdf(log, $event)"
                  >
                    {{ log.invoiceNumberFormatted }}
                    <span class="sl-inv-pdf-icon" aria-hidden="true">↗</span>
                  </a>
                  <span
                    v-if="log.invoiceLinkStatus"
                    :class="serviceLogInvoiceLinkStatusClass(log.invoiceLinkStatus.key)"
                  >
                    {{ log.invoiceLinkStatus.label }}
                  </span>
                </div>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-actions">
                <ServiceLogListRowActions
                  :log-id="log.id"
                  :log-label="logNumberDisplay(log.logNumber)"
                  :status="log.status as ServiceLogStatus"
                  :invoice-id="log.invoiceId"
                  :can-send-to-invoice="log.canSendToInvoice"
                  :can-revert-invoice="log.canRevertInvoice"
                  :can-mark-ready="log.canMarkReady"
                  @changed="onRowChanged"
                  @error="onRowActionError"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="error" id="log-queue-empty" class="empty">Could not load service logs.</div>
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
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
}

.sl-list-cust-req {
  font-size: 10px;
  padding: 1px 7px;
}

.sl-inv-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
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

.sl-inv-status {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
}

.sl-inv-status--queued {
  color: #94a3b8;
}

.sl-inv-status--in_progress {
  color: #16a34a;
}

.sl-inv-status--sent {
  color: #16a34a;
}
</style>
