<script setup lang="ts">
// Invoice detail — line items, API totals, status actions, PDF preview.
import { isEditingSessionNoise } from '#shared/audit-messages'
import {
  auditWhenDisplay,
  formatInvoiceAuditAction,
  invoiceDateDisplay,
  invoiceStatusHeadline,
  invoiceStatusPill,
  isInvoiceOverdue,
  lineQuantityDisplay,
  lineTypeLabel,
  lineTypePill,
  moneyDisplay,
  paymentTermsLabel,
  type InvoiceLineType,
  type InvoiceStatus,
  type InvoiceVehicleSnapshotDisplay,
} from '~/utils/invoices-ui'
import { odoDisplay, vehicleSub } from '~/utils/vehicles-ui'
import { logNumberDisplay } from '~/utils/service-logs-ui'
import { phoneDisplay } from '~/utils/phone-ui'

definePageMeta({ layout: 'staff' })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CatalogSnapshotBits {
  description: string | null
}

interface CustomerSnapshotBits {
  email: string | null
  phone: string | null
}

interface LineItem {
  id: string
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  lineAmount: string
  catalogSnapshot: CatalogSnapshotBits | null
}

interface Invoice {
  id: string
  invoiceNumberFormatted: string
  status: InvoiceStatus
  invoiceDate: string
  dueDate: string | null
  paymentTerms: string
  poNumber: string | null
  customerId: string | null
  vehicleId: string | null
  serviceLogId: string | null
  customerName: string
  customerSnapshot: CustomerSnapshotBits | null
  vehicleSnapshot: InvoiceVehicleSnapshotDisplay | null
  subtotal: string
  taxAmount: string
  taxExempt: boolean
  discountAmount: string
  feesAmount: string
  shopSuppliesPercent: string | null
  total: string
  amountPaid: string
  balanceDue: string
  lineItems: LineItem[]
}

interface HistoryRow {
  id: string
  action: string
  actorName: string | null
  changedFields: string[] | null
  beforeData?: Record<string, unknown> | null
  afterData: Record<string, unknown> | null
  createdAt: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = computed(() => String(route.params.id || ''))
const idValid = computed(() => UUID_RE.test(id.value))
const canRead = computed(() => auth.loaded && auth.can('invoices.read.all'))

const {
  activeEditor,
  loading: sessionLoading,
  canAdminRelease,
  isSelfEditing,
  forceRelease,
  forceReleaseBusy,
  forceReleaseError,
} = useEditingSessionStatus('invoice', id.value)

const { data, refresh, error } = useFetch<{
  invoice: Invoice
  history: HistoryRow[]
  sendDelivery: {
    jobId: string
    status: string
    lastError: string | null
    recipientEmail: string | null
    updatedAt: string
  } | null
  pdf: {
    hasOfficialPdf: boolean
    invoiceFileId: string | null
    pendingJobId: string | null
    pendingJobStatus: string | null
  } | null
}>(() => (idValid.value ? `/api/invoices/${id.value}` : null), {
  server: false,
  lazy: true,
  immediate: false,
  watch: false,
})

function loadInvoiceDetail() {
  if (!import.meta.client) return
  if (!canRead.value) return
  if (!idValid.value) return
  void refresh()
}

onMounted(() => {
  loadInvoiceDetail()
})

watch([canRead, id], () => {
  loadInvoiceDetail()
})

const invoice = computed(() => data.value?.invoice)
const history = computed(() =>
  (data.value?.history ?? []).filter(row => !isEditingSessionNoise(row.action)),
)
const sendDelivery = computed(() => data.value?.sendDelivery)
const lines = computed(() => invoice.value?.lineItems ?? [])
const isPdfEligible = computed(() =>
  !!invoice.value && ['sent', 'paid'].includes(invoice.value.status),
)

const loadErrorMessage = computed(() => {
  if (!idValid.value) return 'This invoice link is invalid.'
  const msg = (error.value as { data?: { message?: string } } | null)?.data?.message
  if (msg) return msg
  if (error.value) return 'Invoice not found or you do not have access.'
  return null
})

const sendInProgress = computed(() =>
  !!invoice.value
  && ['draft', 'pending_manager_approval'].includes(invoice.value.status)
  && sendDelivery.value
  && ['queued', 'processing'].includes(sendDelivery.value.status),
)
const sendFailed = computed(() =>
  !!invoice.value
  && ['draft', 'pending_manager_approval'].includes(invoice.value.status)
  && sendDelivery.value?.status === 'failed',
)

const canSendNow = computed(() =>
  !!invoice.value
  && (invoice.value.status === 'draft' || invoice.value.status === 'pending_manager_approval'),
)

const savedNotice = ref('')

watch(
  () => route.query.saved,
  (saved) => {
    if (saved !== 'draft') return
    savedNotice.value = 'Invoice saved.'
    const { saved: _saved, ...rest } = route.query
    void router.replace({ path: route.path, query: rest })
  },
  { immediate: true },
)

let sendPollTimer: ReturnType<typeof setInterval> | undefined
watch(sendInProgress, (active) => {
  if (active && !sendPollTimer) {
    sendPollTimer = setInterval(() => { refresh() }, 5000)
  }
  else if (!active && sendPollTimer) {
    clearInterval(sendPollTimer)
    sendPollTimer = undefined
  }
}, { immediate: true })

onUnmounted(() => {
  if (sendPollTimer) clearInterval(sendPollTimer)
})

const { data: linkedLogData } = useFetch<{
  log: { logNumber: number }
  files: { id: string, originalFilename: string, mimeType: string }[]
}>(
  () => (invoice.value?.serviceLogId ? `/api/service-logs/${invoice.value.serviceLogId}` : null),
  { server: false, lazy: true, watch: [() => invoice.value?.serviceLogId] },
)

const serviceLogImages = computed(() =>
  (linkedLogData.value?.files ?? []).filter(f => f.mimeType.startsWith('image/')),
)
const hasServiceLogPhotos = computed(() => !!invoice.value?.serviceLogId && serviceLogImages.value.length > 0)
const photoGalleryIndex = ref(0)

const canUpdate = computed(() => auth.can('invoices.update.all'))
const canApprove = computed(() => auth.can('invoices.approve.all'))
const canManagerApprove = computed(() =>
  ['manager', 'admin', 'super_admin'].includes(auth.user?.accountType ?? ''),
)
const canSend = computed(() => auth.can('invoices.send.all'))
const canRecordPayment = computed(() => auth.can('invoices.record_payment.all'))
const canGeneratePdf = computed(() => auth.can('invoices.generate_pdf.all'))

const { busy: pdfDownloadBusy, error: pdfDownloadError, download: downloadInvoicePdf } = useInvoicePdfDownload({
  invoiceId: () => id.value,
  invoiceLabel: () => invoice.value?.invoiceNumberFormatted ?? 'invoice',
  allowOfficialDownload: () => isPdfEligible.value,
  canGeneratePdf: () => canGeneratePdf.value,
  onRefreshed: () => refresh(),
})

const pill = computed(() => {
  if (!invoice.value) return { cls: 'pill gray', label: '—' }
  return invoiceStatusPill(invoice.value.status, invoice.value.dueDate, invoice.value.balanceDue)
})

const headlineStatus = computed(() => {
  if (!invoice.value) return ''
  return invoiceStatusHeadline(invoice.value.status, invoice.value.dueDate, invoice.value.balanceDue)
})

const dueIsOverdue = computed(() =>
  !!invoice.value
  && isInvoiceOverdue(invoice.value.status, invoice.value.dueDate, invoice.value.balanceDue),
)

const isDraft = computed(() => invoice.value?.status === 'draft')
const removableInvoice = computed(() =>
  invoice.value && invoice.value.status !== 'void' && invoice.value.status !== 'paid',
)
const showRecordPayment = computed(() =>
  invoice.value && invoice.value.status === 'sent'
  && Number.parseFloat(invoice.value.balanceDue) > 0,
)

const busy = ref(false)
const actionError = ref('')
const viewTab = ref<'detail' | 'photos' | 'pdf'>('detail')
const pdfPreviewRef = ref<{ refit: () => void } | null>(null)

watch(viewTab, async (tab) => {
  if (tab === 'pdf') {
    await nextTick()
    pdfPreviewRef.value?.refit()
  }
})

async function runAdminForceRelease() {
  const reason = window.prompt('Reason for unlocking this invoice for editing (required):')
  if (!reason?.trim()) return
  await forceRelease(reason.trim())
}

async function runAction(path: string) {
  if (!invoice.value) return
  busy.value = true
  actionError.value = ''
  try {
    const result = await $fetch<{ message?: string }>(path, { method: 'POST' })
    await refresh()
    if (result.message) actionError.value = result.message
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Action failed'
  }
  finally {
    busy.value = false
  }
}

const summaryRows = computed(() => {
  if (!invoice.value) return []
  const inv = invoice.value
  const breakdown = previewLineTypeBreakdown(inv.lineItems.map(line => ({
    lineType: line.lineType,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineAmount: line.lineAmount,
  })))
  const rows: { label: string, value: string, grand?: boolean }[] = [
    { label: 'Parts', value: moneyDisplay(breakdown.parts) },
    { label: 'Labor', value: moneyDisplay(breakdown.labor) },
    { label: 'Fees', value: moneyDisplay(breakdown.fees) },
    { label: 'Subtotal', value: moneyDisplay(inv.subtotal) },
  ]
  if (inv.feesAmount && Number.parseFloat(inv.feesAmount) > 0) {
    rows.push({ label: 'Fees & surcharges', value: moneyDisplay(inv.feesAmount) })
  }
  if (inv.shopSuppliesPercent && Number.parseFloat(inv.shopSuppliesPercent) > 0) {
    rows.push({ label: `Shop supplies (${inv.shopSuppliesPercent}%)`, value: 'Included in fees' })
  }
  const taxLabel = inv.taxExempt ? 'Tax (exempt)' : 'Tax'
  rows.push({ label: taxLabel, value: moneyDisplay(inv.taxAmount) })
  if (inv.discountAmount && Number.parseFloat(inv.discountAmount) > 0) {
    rows.push({ label: 'Discount', value: moneyDisplay(inv.discountAmount, { signed: true }) })
  }
  if (inv.amountPaid && Number.parseFloat(inv.amountPaid) > 0) {
    rows.push({ label: 'Amount paid', value: `−${moneyDisplay(inv.amountPaid)}` })
  }
  rows.push({ label: 'Balance due', value: moneyDisplay(inv.balanceDue), grand: true })
  return rows
})
</script>

<template>
  <section v-if="!auth.loaded || (canRead && idValid && !invoice && !loadErrorMessage)" class="page active">
    <div class="cp-state">Loading invoice…</div>
  </section>

  <section v-else-if="!canRead" class="page active">
    <div class="pagehead">
      <div>
        <h2>Invoice</h2>
        <p><NuxtLink to="/invoices">← Back to invoices</NuxtLink></p>
      </div>
    </div>
    <div class="cp-state">You do not have permission to view invoices.</div>
  </section>

  <section v-else-if="loadErrorMessage" class="page active">
    <div class="pagehead">
      <div>
        <h2>Invoice</h2>
        <p><NuxtLink to="/invoices">← Back to invoices</NuxtLink></p>
      </div>
    </div>
    <div class="card" style="padding:20px;">
      <p style="margin:0 0 12px; color:#dc2626;">{{ loadErrorMessage }}</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button v-if="idValid" type="button" class="btn" @click="refresh()">Retry</button>
        <NuxtLink to="/invoices" class="btn primary">View all invoices</NuxtLink>
      </div>
    </div>
  </section>

  <section v-else-if="invoice" class="page active" :class="{ 'page--invoice-pdf': (viewTab === 'pdf' && canGeneratePdf) || viewTab === 'photos' }">
    <StaffPageHead>
      <template #title>
        {{ invoice.invoiceNumberFormatted }}
        <span :class="pill.cls" style="vertical-align:3px">{{ headlineStatus }}</span>
      </template>
      <template #subtitle>
        <NuxtLink to="/invoices">Invoices</NuxtLink>
        / {{ invoice.customerName }} · Issued {{ invoiceDateDisplay(invoice.invoiceDate) }}
      </template>
      <template #actions>
        <button
          v-if="canSend && invoice.status === 'sent'"
          type="button"
          class="btn"
          disabled
          title="Coming soon"
        >
          Send reminder
        </button>
        <button
          v-if="canApprove && !canManagerApprove && invoice.status === 'draft'"
          type="button"
          class="btn"
          :disabled="busy"
          @click="runAction(`/api/invoices/${id}/approve`)"
        >
          Submit for manager approval
        </button>
        <SendInvoiceButton
          v-if="canSend && canSendNow && !sendInProgress"
          :invoice-id="id"
          :disabled="busy"
          @sent="refresh()"
        />
        <NuxtLink
          v-if="canUpdate && isDraft"
          :to="`/invoices/${id}/edit`"
          class="btn"
        >
          Edit
        </NuxtLink>
        <NuxtLink
          v-if="canRecordPayment && showRecordPayment"
          :to="`/invoices/${id}/payment`"
          class="btn primary"
        >
          Record payment
        </NuxtLink>
        <button
          v-if="canGeneratePdf"
          type="button"
          class="btn"
          :disabled="pdfDownloadBusy"
          @click="downloadInvoicePdf"
        >
          {{ pdfDownloadBusy ? 'Preparing…' : 'Download' }}
        </button>
        <ChangeDatesButton
          v-if="invoice.status !== 'void'"
          :invoice-id="id"
          :invoice-date="invoice.invoiceDate"
          :due-date="invoice.dueDate"
          :payment-terms="invoice.paymentTerms"
          :disabled="busy"
          @changed="refresh()"
        />
        <ChangeVehicleButton
          v-if="invoice.status !== 'void' && invoice.customerId"
          :invoice-id="id"
          :customer-id="invoice.customerId"
          :current-vehicle-id="invoice.vehicleId"
          :disabled="busy"
          @changed="refresh()"
        />
        <ReassignEntityButton
          v-if="invoice.status !== 'void'"
          entity-type="invoice"
          :entity-id="id"
          :entity-label="invoice.invoiceNumberFormatted"
          :current-customer-id="invoice.customerId"
          :current-customer-name="invoice.customerName"
          :current-vehicle-id="invoice.vehicleId"
          :disabled="busy"
          @reassigned="refresh()"
        />
        <DeleteEntityButton
          v-if="removableInvoice"
          entity-type="invoice"
          :entity-id="id"
          :entity-label="invoice.invoiceNumberFormatted"
          :disabled="busy"
        />
      </template>
    </StaffPageHead>

    <div class="inv-meta">
      <div class="inv-meta__item">
        <span class="inv-meta__label">Invoice date</span>
        <span class="inv-meta__value">{{ invoiceDateDisplay(invoice.invoiceDate) }}</span>
      </div>
      <div class="inv-meta__item">
        <span class="inv-meta__label">Due</span>
        <span class="inv-meta__value" :class="{ over: dueIsOverdue }">
          {{ invoice.dueDate ? invoiceDateDisplay(invoice.dueDate) : paymentTermsLabel(invoice.paymentTerms) }}
        </span>
      </div>
      <div class="inv-meta__item">
        <span class="inv-meta__label">Terms</span>
        <span class="inv-meta__value">{{ paymentTermsLabel(invoice.paymentTerms) }}</span>
      </div>
      <div class="inv-meta__item">
        <span class="inv-meta__label">Balance due</span>
        <span class="inv-meta__value strong">{{ moneyDisplay(invoice.balanceDue) }}</span>
      </div>
    </div>

    <p v-if="savedNotice" class="flash ok" style="margin:-8px 0 16px;">{{ savedNotice }}</p>
    <p v-if="actionError" class="help" :style="{ color: actionError.includes('queued') ? '#059669' : '#dc2626', margin: '-8px 0 16px' }">{{ actionError }}</p>
    <p v-if="pdfDownloadError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ pdfDownloadError }}</p>
    <p v-if="sendInProgress" class="flash ok" style="margin:-8px 0 16px;">
      Email delivery in progress to {{ sendDelivery?.recipientEmail ?? 'customer' }}.
      Status will change to Sent after the PDF is generated and the email is delivered.
    </p>
    <p v-if="sendFailed" class="flash" style="margin:-8px 0 16px; background:#fef2f2; color:#b91c1c;">
      Email delivery failed{{ sendDelivery?.lastError ? `: ${sendDelivery.lastError}` : '' }}.
      Fix the issue (check pdf-worker and worker containers), then click Send invoice again.
    </p>

    <div
      v-if="isDraft && activeEditor && !sessionLoading"
      class="edit-lock-banner"
    >
      <div>
        <template v-if="isSelfEditing">
          You have this invoice open in the editor.
        </template>
        <template v-else>
          <b>{{ activeEditor.userName }}</b> is editing this invoice — detail view is read-only until they finish.
        </template>
      </div>
      <button
        v-if="canAdminRelease && !isSelfEditing"
        type="button"
        class="btn sm"
        :disabled="forceReleaseBusy"
        @click="runAdminForceRelease"
      >
        Force release
      </button>
    </div>
    <p v-if="forceReleaseError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ forceReleaseError }}</p>

    <div v-if="canGeneratePdf || hasServiceLogPhotos" class="ed-tabs-wrap">
      <div class="ed-tabs" role="tablist" aria-label="Invoice views">
        <button
          type="button"
          class="ed-tab"
          :class="{ on: viewTab === 'detail' }"
          role="tab"
          :aria-selected="viewTab === 'detail'"
          @click="viewTab = 'detail'"
        >
          Details
        </button>
        <button
          v-if="hasServiceLogPhotos"
          type="button"
          class="ed-tab"
          :class="{ on: viewTab === 'photos' }"
          role="tab"
          :aria-selected="viewTab === 'photos'"
          @click="viewTab = 'photos'"
        >
          Photos
          <span class="ed-tab-pill">{{ serviceLogImages.length }}</span>
        </button>
        <button
          v-if="canGeneratePdf"
          type="button"
          class="ed-tab"
          :class="{ on: viewTab === 'pdf' }"
          role="tab"
          :aria-selected="viewTab === 'pdf'"
          @click="viewTab = 'pdf'"
        >
          PDF preview
        </button>
      </div>
    </div>

    <div v-show="viewTab === 'detail'" class="inv-detail-body">
      <div class="cols">
        <div class="stack">
          <div class="card">
          <div class="chead">
            <h3>Line items · {{ lines.length }}</h3>
            <div class="right">
              <span class="pill gray">{{ paymentTermsLabel(invoice.paymentTerms) }}</span>
            </div>
          </div>
          <div class="tscroll">
            <table class="tbl inv-detail-tbl">
              <thead>
                <tr>
                  <th class="col-desc">Description</th>
                  <th class="col-qty">Qty / Hrs</th>
                  <th class="num col-rate">Rate</th>
                  <th class="num col-line">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in lines" :key="line.id">
                  <td class="col-desc">
                    <span :class="lineTypePill(line.lineType)" style="margin-right:8px">{{ lineTypeLabel(line.lineType) }}</span>
                    {{ line.description }}
                    <span v-if="line.catalogSnapshot?.description" class="sub">{{ line.catalogSnapshot.description }}</span>
                  </td>
                  <td class="col-qty">{{ lineQuantityDisplay(line.quantity, line.lineType) }}</td>
                  <td class="num col-rate">{{ moneyDisplay(line.unitPrice) }}</td>
                  <td class="num col-line">{{ moneyDisplay(line.lineAmount) }}</td>
                </tr>
                <tr v-if="!lines.length">
                  <td colspan="4" class="empty" style="display:table-cell;">No line items yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="ed-sums">
            <div
              v-for="(row, i) in summaryRows"
              :key="i"
              class="row"
              :class="{ grand: row.grand }"
            >
              <span>{{ row.label }}</span>
              <span>{{ row.value }}</span>
            </div>
          </div>
        </div>

        <div v-if="Number.parseFloat(invoice.amountPaid) > 0" class="card">
          <div class="chead"><h3>Payments</h3></div>
          <div class="tscroll">
            <table class="tbl">
              <thead>
                <tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ invoiceDateDisplay(invoice.invoiceDate) }}</td>
                  <td>Recorded</td>
                  <td class="mono">—</td>
                  <td class="num">{{ moneyDisplay(invoice.amountPaid) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="chead">
            <h3>Customer</h3>
            <div v-if="invoice.customerId" class="right">
              <NuxtLink :to="`/customers/${invoice.customerId}`" class="btn ghost sm">View →</NuxtLink>
            </div>
          </div>
          <dl class="kv">
            <dt>Account</dt><dd>{{ invoice.customerName }}</dd>
            <dt>Email</dt><dd>{{ invoice.customerSnapshot?.email ?? '—' }}</dd>
            <dt>Phone</dt><dd>{{ phoneDisplay(invoice.customerSnapshot?.phone) }}</dd>
            <dt>Terms</dt><dd>{{ paymentTermsLabel(invoice.paymentTerms) }}</dd>
            <dt>PO / ref</dt><dd>{{ invoice.poNumber ?? '—' }}</dd>
            <dt>Balance due</dt><dd>{{ moneyDisplay(invoice.balanceDue) }}</dd>
          </dl>
        </div>

        <div v-if="invoice.customerId || invoice.vehicleSnapshot" class="card">
          <div class="chead">
            <h3>Vehicle</h3>
            <div v-if="invoice.vehicleId" class="right">
              <NuxtLink :to="`/vehicles/${invoice.vehicleId}`" class="btn ghost sm">View →</NuxtLink>
            </div>
          </div>
          <dl v-if="invoice.vehicleSnapshot" class="kv">
            <dt>Unit</dt><dd>{{ vehicleSub(invoice.vehicleSnapshot) }}</dd>
            <dt>VIN</dt><dd class="mono" style="font-size:12px">{{ invoice.vehicleSnapshot.vin ?? '—' }}</dd>
            <dt>Odometer</dt><dd>{{ odoDisplay(invoice.vehicleSnapshot.odometer, invoice.vehicleSnapshot.odometerUnit || 'mi') }}</dd>
            <dt>Fleet #</dt><dd>{{ invoice.vehicleSnapshot.busNumber ?? invoice.vehicleSnapshot.unitTag ?? '—' }}</dd>
          </dl>
          <p v-else style="margin:0; padding:4px 2px; color:#64748b; font-size:13.5px;">
            No unit attached to this invoice.
          </p>
        </div>

        <div v-if="invoice.serviceLogId" class="card">
          <div class="chead">
            <h3>Source service log</h3>
            <div class="right">
              <NuxtLink :to="`/service-logs/${invoice.serviceLogId}`" class="btn ghost sm">View →</NuxtLink>
            </div>
          </div>
          <dl class="kv">
            <dt>Log</dt>
            <dd>{{ logNumberDisplay(linkedLogData?.log?.logNumber ?? 0) }}</dd>
            <dt>Status</dt><dd>Linked to this invoice</dd>
          </dl>
        </div>
      </div>
      </div>

      <div class="card inv-detail-history">
        <div class="chead">
          <h3>Change history</h3>
        </div>
        <div class="tscroll">
          <table class="tbl hist-log">
            <thead>
              <tr><th>When</th><th>User</th><th>Change</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in history" :key="row.id">
                <td class="when">{{ auditWhenDisplay(row.createdAt) }}</td>
                <td class="who">{{ row.actorName ?? 'system' }}</td>
                <td class="chg">{{ formatInvoiceAuditAction(row.action, row) }}</td>
              </tr>
              <tr v-if="!history.length">
                <td class="when">—</td>
                <td class="who">—</td>
                <td class="chg">No activity recorded yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="viewTab === 'pdf' && canGeneratePdf" class="invoice-pdf-tab">
      <InvoicePdfPreviewPane
        ref="pdfPreviewRef"
        :invoice-id="id"
        :invoice-label="invoice.invoiceNumberFormatted"
        :can-generate-pdf="canGeneratePdf"
      />
    </div>

    <div v-if="viewTab === 'photos' && hasServiceLogPhotos" class="invoice-photos-tab">
      <div class="card">
        <div class="chead">
          <h3>Service log photos</h3>
          <div class="right">
            <NuxtLink
              v-if="invoice.serviceLogId"
              :to="`/service-logs/${invoice.serviceLogId}`"
              class="btn ghost sm"
            >
              Open log →
            </NuxtLink>
          </div>
        </div>
        <div class="cbody">
          <p class="help" style="margin:0 0 14px;">
            Photos from {{ logNumberDisplay(linkedLogData?.log?.logNumber ?? 0) }} — use arrow keys or buttons to browse.
          </p>
          <ServiceLogImageGallery v-model="photoGalleryIndex" :files="serviceLogImages" />
        </div>
      </div>
    </div>
  </section>

  <section v-else class="page active">
    <div class="cp-state">Invoice not found.</div>
  </section>
</template>

<style scoped>
.inv-detail-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.inv-detail-history {
  width: 100%;
}

.page--invoice-pdf {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: 100%;
  overflow: hidden;
  padding-bottom: 16px;
}

.page--invoice-pdf :deep(.pagehead) {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.page--invoice-pdf .ed-tabs-wrap {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.page--invoice-pdf .help,
.page--invoice-pdf .flash,
.page--invoice-pdf .edit-lock-banner,
.page--invoice-pdf .inv-meta {
  flex-shrink: 0;
}

.inv-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 28px;
  padding: 12px 16px;
  margin: -4px 0 16px;
  background: var(--surface-2, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
}

.inv-meta__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 96px;
}

.inv-meta__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted, #64748b);
}

.inv-meta__value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text, #0f172a);
}

.inv-meta__value.strong {
  font-weight: 700;
}

.inv-meta__value.over {
  color: #dc2626;
  font-weight: 700;
}

.invoice-pdf-tab,
.invoice-photos-tab {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
