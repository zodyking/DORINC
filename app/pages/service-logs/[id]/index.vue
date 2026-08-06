<script setup lang="ts">
// Simple mobile-first service log detail — photos, dates, symptoms, actions.
import ServiceLogPhotoManager from '~/components/service-logs/ServiceLogPhotoManager.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { openServiceLogInvoicePdf } from '~/utils/invoice-pdf'
import { messageLinkFetchQuery } from '~/utils/message-link-access'
import type { ServiceLogInvoiceLinkStatus } from '~/utils/service-log-invoice-status'
import { vehicleLine, vehicleTag } from '~/utils/vehicles-ui'
import {
  CUSTOMER_REQUESTED_SERVICE_NOTE,
  formatAuditAction,
  logNumberDisplay,
  revertInvoiceBlockLabel,
  serviceLogInvoiceLinkReleased,
  serviceLogStatusPill,
  type ServiceLogStatus,
} from '~/utils/service-logs-ui'
import { lineTypeLabel, type InvoiceLineType } from '~/utils/invoices-ui'

definePageMeta({ layout: 'staff' })

interface VehicleBits {
  id: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  vin: string | null
}

interface DraftLine {
  lineType?: string | null
  description: string
  qty?: string | null
  rate?: string | null
  amount?: string | null
}

interface ServiceLog {
  id: string
  logNumber: number
  status: ServiceLogStatus
  workType: string
  serviceDate: string
  dueDate: string | null
  odometerReading: string | null
  location: string | null
  complaint: string | null
  internalNotes: string | null
  draftLineItems: DraftLine[] | null
  statusReason: string | null
  invoiceId: string | null
  customerRequested: boolean
  customerId: string | null
  vehicleId: string | null
  customerName: string
  submitterName: string
  submittedBy: string
  createdAt: string
  updatedAt: string
  vehicle: VehicleBits
}

interface FileMeta {
  id: string
  fileKind: string
  originalFilename: string
  mimeType: string
  width: number | null
  height: number | null
}

interface HistoryRow {
  id: string
  action: string
  actorName: string | null
  changedFields: string[] | null
  afterData: Record<string, unknown> | null
  createdAt: string
}

const route = useRoute()
const auth = useAuthStore()
const id = route.params.id as string

const { data, refresh, error } = useClientFetch<{
  log: ServiceLog
  files: FileMeta[]
  history: HistoryRow[]
  invoiceLinkStatus: ServiceLogInvoiceLinkStatus | null
  actions: {
    canSendToInvoice: boolean
    canRevertInvoice: boolean
    revertBlockReason: string | null
  }
}>(`/api/service-logs/${id}`, { query: computed(() => messageLinkFetchQuery(route.query)) })

const log = computed(() => data.value?.log)
const invoiceLinkStatus = computed(() => data.value?.invoiceLinkStatus ?? null)
const files = computed(() => data.value?.files ?? [])
const history = computed(() => data.value?.history ?? [])
const actions = computed(() => data.value?.actions ?? {
  canSendToInvoice: false,
  canRevertInvoice: false,
  revertBlockReason: null,
})
const draftLines = computed(() => (Array.isArray(log.value?.draftLineItems) ? log.value!.draftLineItems! : []))

const canReview = computed(() => auth.can('service_logs.review.all'))
const canExtract = computed(() => auth.can('ai.extract.all') && canReview.value)
const canUpload = computed(() => auth.can('service_logs.upload.own'))
const isOwner = computed(() => log.value?.submittedBy === auth.user?.id)
const canEditLog = computed(() => {
  if (!log.value || log.value.status === 'converted_to_invoice') return false
  if (canReview.value) return true
  return isOwner.value && canUpload.value
})

const editBusy = ref(false)
const editError = ref('')
const editSaved = ref(false)
const editForm = reactive({
  serviceDate: '',
  dueDate: '',
  complaint: '',
})

watch(log, (row) => {
  if (!row) return
  editForm.serviceDate = row.serviceDate
  editForm.dueDate = row.dueDate ?? ''
  editForm.complaint = row.complaint ?? ''
  editSaved.value = false
}, { immediate: true })

async function saveLogEdits() {
  if (!canEditLog.value) return
  if (editForm.dueDate && editForm.serviceDate && editForm.dueDate < editForm.serviceDate) {
    editError.value = 'Due date must be on or after the invoice date.'
    return
  }
  editBusy.value = true
  editError.value = ''
  editSaved.value = false
  try {
    await $fetch(`/api/service-logs/${id}`, {
      method: 'PATCH',
      body: {
        serviceDate: editForm.serviceDate,
        dueDate: editForm.dueDate || null,
        complaint: editForm.complaint || null,
      },
    })
    await refresh()
    editSaved.value = true
  }
  catch (e: unknown) {
    editError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    editBusy.value = false
  }
}

const imageFiles = computed(() => files.value.filter(f => f.mimeType.startsWith('image/')))
const showPhotoSection = computed(() => canEditLog.value || imageFiles.value.length > 0)
const selectedFileId = computed(() => imageFiles.value[0]?.id ?? null)
const aiModalOpen = ref(false)

const busy = ref(false)
const actionError = ref('')
const convertFlash = ref('')

async function changeStatus(status: ServiceLogStatus, reason?: string) {
  if (!log.value) return
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/service-logs/${id}/status`, { method: 'POST', body: { status, reason } })
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Status change failed'
  }
  finally {
    busy.value = false
  }
}

async function revertInvoice() {
  if (!log.value || !actions.value.canRevertInvoice) return
  busy.value = true
  actionError.value = ''
  convertFlash.value = ''
  try {
    await $fetch(`/api/service-logs/${id}/revert-invoice`, { method: 'POST' })
    await refresh()
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Undo failed')
  }
  finally {
    busy.value = false
  }
}

async function convertToInvoice() {
  if (!log.value) return
  busy.value = true
  actionError.value = ''
  convertFlash.value = ''
  try {
    const { invoice } = await $fetch<{ invoice: { id: string } }>(
      `/api/service-logs/${id}/convert-to-invoice`,
      {
        method: 'POST',
        body: {
          invoiceDate: log.value.serviceDate,
          dueDate: log.value.dueDate,
        },
      },
    )
    await refresh()
    convertFlash.value = invoice.id
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Invoice conversion failed')
  }
  finally {
    busy.value = false
  }
}

function openAiExtraction() {
  if (!canExtract.value || !imageFiles.value.length) return
  aiModalOpen.value = true
}

const pdfOpenBusy = ref(false)

async function openLinkedInvoicePdf() {
  if (!log.value?.invoiceId || pdfOpenBusy.value) return
  pdfOpenBusy.value = true
  actionError.value = ''
  try {
    await openServiceLogInvoicePdf(log.value.id)
  }
  catch (err) {
    actionError.value = syncFetchErrorMessage(err, 'Could not open invoice PDF')
  }
  finally {
    pdfOpenBusy.value = false
  }
}

const pill = computed(() => log.value
  ? serviceLogStatusPill(log.value.status, { invoiceId: log.value.invoiceId, invoiceLinkStatus: invoiceLinkStatus.value })
  : { cls: 'pill gray', label: '—' })
</script>

<template>
  <section v-if="error" class="page active sl-detail-page">
    <div class="empty">Service log not found or you do not have access.</div>
  </section>

  <section v-else-if="log" class="page active sl-detail-page">
    <StaffPageHead>
      <template #title>
        {{ logNumberDisplay(log.logNumber) }}
        <span :class="pill.cls" style="vertical-align:3px">{{ pill.label }}</span>
      </template>
      <template #subtitle>
        <NuxtLink to="/service-logs">Service Logs</NuxtLink>
        / {{ vehicleTag(log.vehicle) }} · {{ log.customerName }}
      </template>
      <template #actions>
        <button
          v-if="actions.canSendToInvoice"
          class="btn primary"
          type="button"
          :disabled="busy"
          @click="convertToInvoice"
        >
          Send to invoice
        </button>
        <button
          v-if="actions.canRevertInvoice"
          class="btn"
          type="button"
          :disabled="busy"
          @click="revertInvoice"
        >
          Undo send
        </button>
        <button
          v-if="canExtract && imageFiles.length"
          type="button"
          class="btn"
          :disabled="busy"
          @click="openAiExtraction"
        >
          Extract from image
        </button>
        <button
          v-if="(canReview || (isOwner && canUpload)) && ['draft', 'uploaded'].includes(log.status)"
          class="btn primary"
          type="button"
          :disabled="busy"
          @click="changeStatus('ready_for_review')"
        >
          Mark ready
        </button>
        <button
          v-if="isOwner && log.status === 'needs_info'"
          class="btn primary"
          type="button"
          :disabled="busy"
          @click="changeStatus('ready_for_review')"
        >
          Resubmit
        </button>
        <NuxtLink
          v-if="log.status === 'converted_to_invoice' && log.invoiceId"
          :to="`/invoices/${log.invoiceId}`"
          class="btn"
        >
          View invoice
        </NuxtLink>
        <DeleteEntityButton
          v-if="log.status !== 'archived' && !log.invoiceId"
          entity-type="service_log"
          :entity-id="log.id"
          :entity-label="logNumberDisplay(log.logNumber)"
          :disabled="busy"
        />
      </template>
    </StaffPageHead>

    <p v-if="actionError" class="help sl-flash-err">{{ actionError }}</p>
    <p v-if="log.customerRequested" class="flash info sl-flash">
      {{ CUSTOMER_REQUESTED_SERVICE_NOTE }}
    </p>
    <p v-if="log && serviceLogInvoiceLinkReleased(log.statusReason)" class="flash warn sl-flash">
      The linked invoice was deleted. This log is ready to send to invoice again.
    </p>
    <p v-if="convertFlash" class="flash ok sl-flash">
      Sent to invoice.
      <NuxtLink :to="`/invoices/${convertFlash}`">View invoice</NuxtLink>
    </p>
    <p v-else-if="log.status === 'converted_to_invoice' && log.invoiceId" class="flash ok sl-flash">
      Linked to an invoice.
      <NuxtLink :to="`/invoices/${log.invoiceId}`">View invoice</NuxtLink>
      <template v-if="actions.canRevertInvoice"> · You can undo send to edit again.</template>
    </p>
    <p
      v-if="log.status === 'converted_to_invoice' && !actions.canRevertInvoice && actions.revertBlockReason"
      class="help sl-flash"
    >
      {{ revertInvoiceBlockLabel(actions.revertBlockReason) }}
    </p>
    <p v-if="log.statusReason && !serviceLogInvoiceLinkReleased(log.statusReason)" class="help sl-flash">
      Review note: {{ log.statusReason }}
    </p>

    <div class="sl-detail-stack">
      <div v-if="showPhotoSection" class="card">
        <div class="chead">
          <h3>Photos · {{ imageFiles.length }}</h3>
        </div>
        <div class="cbody">
          <ServiceLogPhotoManager
            :service-log-id="id"
            :files="imageFiles"
            :editable="canEditLog"
            @refreshed="refresh()"
          />
        </div>
      </div>

      <div class="card">
        <div class="chead">
          <h3>{{ canEditLog ? 'Details' : 'Summary' }}</h3>
          <button
            v-if="canEditLog"
            type="button"
            class="btn sm primary"
            :disabled="editBusy"
            @click="saveLogEdits"
          >
            {{ editBusy ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <div v-if="canEditLog" class="cbody stack sl-edit-fields">
          <p v-if="editError" class="help" style="color:#dc2626; margin:0;">{{ editError }}</p>
          <p v-else-if="editSaved" class="help" style="color:#059669; margin:0;">Saved.</p>
          <label class="fld"><span>Invoice date</span>
            <input v-model="editForm.serviceDate" type="date">
          </label>
          <label class="fld"><span>Due date</span>
            <input v-model="editForm.dueDate" type="date" :min="editForm.serviceDate || undefined">
          </label>
          <label class="fld"><span>Vehicle symptoms / customer complaint</span>
            <textarea v-model="editForm.complaint" rows="4" />
          </label>
        </div>
        <dl v-else class="kv cbody">
          <dt>Invoice date</dt><dd>{{ log.serviceDate }}</dd>
          <dt>Due date</dt><dd>{{ log.dueDate || '—' }}</dd>
          <dt>Symptoms / complaint</dt>
          <dd class="sl-complaint">{{ log.complaint || '—' }}</dd>
        </dl>
      </div>

      <div class="card">
        <div class="chead"><h3>Customer &amp; vehicle</h3></div>
        <dl class="kv cbody">
          <dt>Customer</dt><dd>{{ log.customerName }}</dd>
          <dt>Vehicle</dt><dd>{{ vehicleLine(log.vehicle) }}</dd>
          <dt>Submitted by</dt><dd>{{ log.submitterName }}</dd>
          <dt>Uploaded</dt><dd>{{ new Date(log.createdAt).toLocaleString() }}</dd>
          <dt>Status</dt><dd><span :class="pill.cls">{{ pill.label }}</span></dd>
          <template v-if="log.invoiceId">
            <dt>Invoice</dt>
            <dd>
              <NuxtLink :to="`/invoices/${log.invoiceId}`">View</NuxtLink>
              ·
              <button type="button" class="link-btn" :disabled="pdfOpenBusy" @click="openLinkedInvoicePdf">
                Open PDF
              </button>
            </dd>
          </template>
        </dl>
        <div v-if="canEditLog && log.customerId" class="cbody sl-entity-actions">
          <ChangeVehicleButton
            entity-type="service_log"
            :entity-id="log.id"
            :customer-id="log.customerId"
            :current-vehicle-id="log.vehicleId"
            :allow-edit="canEditLog"
            :disabled="busy"
            @changed="refresh()"
          />
          <ReassignEntityButton
            entity-type="service_log"
            :entity-id="log.id"
            :entity-label="logNumberDisplay(log.logNumber)"
            :current-customer-id="log.customerId"
            :current-customer-name="log.customerName"
            :current-vehicle-id="log.vehicleId"
            :disabled="busy"
            @reassigned="refresh()"
          />
        </div>
      </div>

      <div v-if="draftLines.length && canReview" class="card">
        <div class="chead"><h3>Draft lines · {{ draftLines.length }}</h3></div>
        <div class="tscroll">
          <table class="tbl">
            <thead>
              <tr><th>Type</th><th>Description</th><th>Qty</th><th class="num">Amount</th></tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in draftLines" :key="i">
                <td>{{ line.lineType ? lineTypeLabel(line.lineType as InvoiceLineType) : '—' }}</td>
                <td>{{ line.description }}</td>
                <td>{{ line.qty ?? '—' }}</td>
                <td class="num">{{ line.amount ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="chead"><h3>Activity</h3></div>
        <div class="timeline">
          <div
            v-for="row in history"
            :key="row.id"
            class="tl"
            :class="{ hot: row.action.includes('ready_for_review') }"
          >
            <b>{{ formatAuditAction(row.action) }}</b>
            <span>
              {{ new Date(row.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }}
              · {{ row.actorName ?? 'System' }}
            </span>
          </div>
          <div v-if="!history.length" class="tl"><b>Log created</b><span>No activity yet</span></div>
        </div>
      </div>
    </div>

    <div v-if="log && log.status !== 'archived'" class="savebar">
      <NuxtLink to="/service-logs" class="btn">Back</NuxtLink>
    </div>

    <ServiceLogAiExtractModal
      :open="aiModalOpen"
      :service-log-id="id"
      :selected-file-id="selectedFileId"
      :can-extract="canExtract"
      @close="aiModalOpen = false"
      @refreshed="refresh()"
    />
  </section>
</template>

<style scoped>
.sl-detail-page {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 88px;
}

.sl-detail-stack {
  display: grid;
  gap: 14px;
}

.sl-flash,
.sl-flash-err {
  margin: -4px 0 12px;
}

.sl-flash-err {
  color: #dc2626;
}

.sl-edit-fields {
  gap: 12px;
}

.sl-complaint {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.sl-entity-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 0;
}

.link-btn {
  background: none;
  border: none;
  font: inherit;
  color: #3b82f6;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover:not(:disabled) {
  text-decoration: underline;
}

.link-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
