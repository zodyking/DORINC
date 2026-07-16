<script setup lang="ts">
// Service log detail — photo gallery + status actions.
import ServiceLogImageGallery from '~/components/service-logs/ServiceLogImageGallery.vue'

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
  actions: {
    canSendToInvoice: boolean
    canRevertInvoice: boolean
    revertBlockReason: string | null
  }
}>(`/api/service-logs/${id}`)

const log = computed(() => data.value?.log)
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
  odometerReading: '',
  location: '',
  workType: 'repair',
  complaint: '',
  internalNotes: '',
})

watch(log, (row) => {
  if (!row) return
  editForm.serviceDate = row.serviceDate
  editForm.odometerReading = row.odometerReading ?? ''
  editForm.location = row.location ?? ''
  editForm.workType = row.workType
  editForm.complaint = row.complaint ?? ''
  editForm.internalNotes = row.internalNotes ?? ''
  editSaved.value = false
}, { immediate: true })

async function saveLogEdits() {
  if (!canEditLog.value) return
  editBusy.value = true
  editError.value = ''
  editSaved.value = false
  try {
    await $fetch(`/api/service-logs/${id}`, {
      method: 'PATCH',
      body: {
        serviceDate: editForm.serviceDate,
        odometerReading: editForm.odometerReading || null,
        location: editForm.location || null,
        workType: editForm.workType,
        complaint: editForm.complaint || null,
        internalNotes: editForm.internalNotes || null,
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
const otherFiles = computed(() => files.value.filter(f => !f.mimeType.startsWith('image/')))
const galleryIndex = ref(0)

watch(imageFiles, (imgs) => {
  if (!imgs.length) {
    galleryIndex.value = 0
    return
  }
  if (galleryIndex.value >= imgs.length) galleryIndex.value = 0
}, { immediate: true })

const selectedFileId = computed(() => imageFiles.value[galleryIndex.value]?.id ?? null)
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
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Undo failed'
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
    const { invoice } = await $fetch<{ invoice: { id: string, invoiceNumberFormatted?: string } }>(
      `/api/service-logs/${id}/convert-to-invoice`,
      { method: 'POST', body: {} },
    )
    await refresh()
    convertFlash.value = invoice.id
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Invoice conversion failed'
  }
  finally {
    busy.value = false
  }
}

function previewUrl(fileId: string) {
  return `/api/files/${fileId}/preview`
}

function openAiExtraction() {
  if (!canExtract.value || !imageFiles.value.length) return
  aiModalOpen.value = true
}

const pill = computed(() => log.value
  ? serviceLogStatusPill(log.value.status, { invoiceId: log.value.invoiceId })
  : { cls: 'pill gray', label: '—' })
</script>

<template>
  <section v-if="error" class="page active">
    <div class="empty">Service log not found or you do not have access.</div>
  </section>

  <section v-else-if="log" class="page active">
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
          Undo send to invoice
        </button>
        <button
          v-if="canExtract && imageFiles.length"
          type="button"
          class="btn"
          :disabled="busy"
          @click="openAiExtraction"
        >
          ✦ Extract from image
        </button>
        <button
          v-if="canReview && log.status === 'in_review'"
          class="btn"
          type="button"
          :disabled="busy"
          @click="changeStatus('needs_info', 'Please add missing details')"
        >
          Request more info
        </button>
        <button
          v-if="isOwner && log.status === 'needs_info'"
          class="btn primary"
          type="button"
          :disabled="busy"
          @click="changeStatus('ready_for_review')"
        >
          Resubmit for review
        </button>
        <button
          v-if="(canReview || (isOwner && canUpload)) && log.status === 'draft'"
          class="btn primary"
          type="button"
          :disabled="busy"
          @click="changeStatus('ready_for_review')"
        >
          Mark ready to invoice
        </button>
        <button
          v-if="canReview && log.status === 'in_review'"
          class="btn"
          type="button"
          :disabled="busy"
          @click="changeStatus('rejected', 'Rejected during review')"
        >
          Reject
        </button>
        <NuxtLink
          v-if="log.status === 'converted_to_invoice' && log.invoiceId && !actions.canRevertInvoice"
          :to="`/invoices/${log.invoiceId}`"
          class="btn"
        >
          View invoice
        </NuxtLink>
        <NuxtLink
          v-if="log.status === 'converted_to_invoice' && log.invoiceId && canReview"
          :to="`/invoices/${log.invoiceId}/edit`"
          class="btn primary"
        >
          Edit invoice
        </NuxtLink>
        <ReassignEntityButton
          v-if="log.status !== 'converted_to_invoice' && log.status !== 'archived'"
          entity-type="service_log"
          :entity-id="log.id"
          :entity-label="logNumberDisplay(log.logNumber)"
          :current-customer-id="log.customerId"
          :current-customer-name="log.customerName"
          :current-vehicle-id="log.vehicleId"
          :disabled="busy"
          @reassigned="refresh()"
        />
        <DeleteEntityButton
          v-if="log.status !== 'archived' && !log.invoiceId"
          entity-type="service_log"
          :entity-id="log.id"
          :entity-label="logNumberDisplay(log.logNumber)"
          :disabled="busy"
        />
      </template>
    </StaffPageHead>

    <p v-if="actionError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ actionError }}</p>
    <p
      v-if="log.customerRequested"
      class="flash info"
      style="margin:-8px 0 16px;"
    >
      {{ CUSTOMER_REQUESTED_SERVICE_NOTE }} — review the customer complaint and complete the log before invoicing.
    </p>
    <p
      v-if="log && serviceLogInvoiceLinkReleased(log.statusReason)"
      class="flash warn"
      style="margin:-8px 0 16px;"
    >
      The linked invoice was deleted. This log is ready to send to invoice again.
    </p>
    <p v-if="convertFlash" class="flash ok" style="margin:-8px 0 16px;">
      Sent to invoice — draft created and linked to this service log.
      <NuxtLink :to="`/invoices/${convertFlash}`">View invoice</NuxtLink>
      ·
      <NuxtLink :to="`/invoices/${convertFlash}/edit`">Edit invoice</NuxtLink>
    </p>
    <p
      v-else-if="log.status === 'converted_to_invoice' && log.invoiceId"
      class="flash ok"
      style="margin:-8px 0 16px;"
    >
      This service log was sent to invoice and remains on file.
      <NuxtLink :to="`/invoices/${log.invoiceId}`">View invoice</NuxtLink>
      <template v-if="actions.canRevertInvoice"> · You can undo send to make this log editable again.</template>
    </p>
    <p
      v-if="log.status === 'converted_to_invoice' && !actions.canRevertInvoice && actions.revertBlockReason"
      class="help"
      style="margin:-8px 0 16px;"
    >
      {{ revertInvoiceBlockLabel(actions.revertBlockReason) }}
    </p>
    <p v-if="log.statusReason" class="help" style="margin:-8px 0 16px;">
      Review note: {{ log.statusReason }}
    </p>

    <div class="cols sl-detail-cols">
      <div class="stack">
        <div v-if="imageFiles.length" class="card">
          <div class="chead">
            <h3>Photos · {{ imageFiles.length }}</h3>
          </div>
          <div class="cbody">
            <ServiceLogImageGallery
              v-model="galleryIndex"
              :service-log-id="id"
              :files="imageFiles"
            />
          </div>
        </div>

        <div v-if="otherFiles.length" class="card">
          <div class="chead"><h3>Other files · {{ otherFiles.length }}</h3></div>
          <div class="cbody">
            <div class="photos">
              <a
                v-for="f in otherFiles"
                :key="f.id"
                :href="previewUrl(f.id)"
                target="_blank"
                rel="noopener"
                class="photo"
              >
                <span>{{ fileThumbEmoji(f.mimeType, f.fileKind) }}</span>
              </a>
            </div>
          </div>
        </div>

        <div v-if="canEditLog" class="card">
          <div class="chead">
            <h3>Edit log</h3>
            <button type="button" class="btn sm primary" :disabled="editBusy" @click="saveLogEdits">
              {{ editBusy ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
          <div class="cbody stack" style="gap:12px;">
            <p v-if="editError" class="help" style="color:#dc2626; margin:0;">{{ editError }}</p>
            <p v-else-if="editSaved" class="help" style="color:#059669; margin:0;">Changes saved.</p>
            <label class="fld"><span>Service date</span>
              <input v-model="editForm.serviceDate" type="date">
            </label>
            <label class="fld"><span>Odometer or hours</span>
              <input v-model="editForm.odometerReading" type="text">
            </label>
            <label class="fld"><span>Job location</span>
              <input v-model="editForm.location" type="text">
            </label>
            <label class="fld"><span>Work type</span>
              <select v-model="editForm.workType">
                <option value="preventive_maintenance">Preventive maintenance</option>
                <option value="repair">Repair / breakdown</option>
                <option value="diagnostic">Diagnostic</option>
                <option value="inspection">Inspection</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label class="fld"><span>Customer complaint / symptoms</span>
              <textarea v-model="editForm.complaint" rows="3" />
            </label>
            <label v-if="canReview" class="fld"><span>Internal notes <span class="fld-badge">Staff only</span></span>
              <textarea v-model="editForm.internalNotes" rows="3" />
            </label>
          </div>
        </div>

        <div v-else class="card">
          <div class="chead"><h3>Customer complaint / symptoms</h3></div>
          <div class="cbody" style="font-size:13.5px; color:#475569; line-height:1.6;">
            {{ log.complaint || '—' }}
          </div>
        </div>

        <div v-if="!canEditLog && canReview" class="card">
          <div class="chead"><h3>Internal notes <span class="fld-badge">Staff only</span></h3></div>
          <div class="cbody" style="font-size:13.5px; color:#475569; line-height:1.6;">
            {{ log.internalNotes || '—' }}
          </div>
        </div>

        <div v-if="draftLines.length" class="card">
          <div class="chead"><h3>Draft line items · {{ draftLines.length }}</h3></div>
          <div class="tscroll">
            <table class="tbl">
              <thead>
                <tr><th>Type</th><th>Description</th><th>Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
              </thead>
              <tbody>
                <tr v-for="(line, i) in draftLines" :key="i">
                  <td>{{ line.lineType ? lineTypeLabel(line.lineType as InvoiceLineType) : '—' }}</td>
                  <td>{{ line.description }}</td>
                  <td>{{ line.qty ?? '—' }}</td>
                  <td class="num">{{ line.rate ?? '—' }}</td>
                  <td class="num">{{ line.amount ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="chead"><h3>Log metadata</h3></div>
          <dl class="kv">
            <dt>Submitted by</dt><dd>{{ log.submitterName }}</dd>
            <dt>Uploaded</dt><dd>{{ new Date(log.createdAt).toLocaleString() }}</dd>
            <dt>Service date</dt><dd>{{ log.serviceDate }}</dd>
            <dt>Customer</dt><dd>{{ log.customerName }}</dd>
            <dt>Vehicle</dt><dd>{{ vehicleLine(log.vehicle) }}</dd>
            <dt>VIN</dt><dd class="mono" style="font-size:12px">{{ log.vehicle.vin ?? '—' }}</dd>
            <dt>Odometer / hours</dt><dd>{{ log.odometerReading ?? '—' }}</dd>
            <dt>Location</dt><dd>{{ log.location ?? '—' }}</dd>
            <dt>Work type</dt><dd>{{ workTypeLabel(log.workType) }}</dd>
            <dt>Status</dt><dd><span :class="pill.cls">{{ pill.label }}</span></dd>
            <template v-if="log.invoiceId">
              <dt>Linked invoice</dt>
              <dd>
                <NuxtLink :to="`/invoices/${log.invoiceId}`">View invoice</NuxtLink>
              </dd>
            </template>
          </dl>
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
            <div v-if="!history.length" class="tl"><b>Log created</b><span>No activity recorded yet</span></div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="log && log.status !== 'archived'" class="savebar">
      <NuxtLink to="/service-logs" class="btn">Back to service logs</NuxtLink>
      <span v-if="log.invoiceId" class="help" style="margin-left:auto;">Linked to an invoice — delete the invoice first or unlink before removing this log.</span>
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
