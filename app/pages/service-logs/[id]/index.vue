<script setup lang="ts">
// Service log detail — side-by-side image review + status actions (mockup: PAGE: SERVICE LOG DETAIL).
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

const { data, refresh, error } = await useFetch<{
  log: ServiceLog
  files: FileMeta[]
  history: HistoryRow[]
}>(`/api/service-logs/${id}`)

const log = computed(() => data.value?.log)
const files = computed(() => data.value?.files ?? [])
const history = computed(() => data.value?.history ?? [])
const draftLines = computed(() => (Array.isArray(log.value?.draftLineItems) ? log.value!.draftLineItems! : []))

const canReview = computed(() => auth.can('service_logs.review.all'))
const canExtract = computed(() => auth.can('ai.extract.all') && canReview.value)
const canConvert = computed(() => auth.can('service_logs.convert.all'))
const isOwner = computed(() => log.value?.submittedBy === auth.user?.id)

const imageFiles = computed(() => files.value.filter(f => f.mimeType.startsWith('image/')))
const selectedFileId = ref<string | null>(null)
const lightboxOpen = ref(false)

watch(imageFiles, (imgs) => {
  if (imgs.length && !selectedFileId.value) selectedFileId.value = imgs[0]!.id
}, { immediate: true })

const selectedFile = computed(() => imageFiles.value.find(f => f.id === selectedFileId.value) ?? imageFiles.value[0])

interface AiSuggestionRow {
  id: string
  status: 'pending' | 'accepted' | 'edited' | 'rejected'
  featureType: string
  originalContent: Record<string, unknown> | null
  suggestedContent: Record<string, unknown>
  createdAt: string
}

const { data: aiData, refresh: refreshAi } = await useFetch<{ suggestions: AiSuggestionRow[] }>(
  `/api/service-logs/${id}/ai-suggestions`,
)

const aiSuggestions = computed(() => aiData.value?.suggestions ?? [])

const pendingExtraction = computed(() => {
  const fileId = selectedFile.value?.id
  const pending = aiSuggestions.value.filter(s => s.status === 'pending' && s.featureType === 'service_log_extraction')
  if (!fileId) return pending[0] ?? null
  return pending.find((s) => {
    const fid = s.suggestedContent.fileId as string | undefined
    return !fid || fid === fileId
  }) ?? pending[0] ?? null
})

const extractBusy = ref(false)
const extractError = ref('')
const editComplaint = ref('')
const editInternal = ref('')
const editDraftJson = ref('')

watch(pendingExtraction, (s) => {
  if (!s) {
    editComplaint.value = ''
    editInternal.value = ''
    editDraftJson.value = ''
    return
  }
  const c = s.suggestedContent as { complaint?: string, internalNotes?: string, draftLineItems?: unknown[] }
  editComplaint.value = c.complaint ?? ''
  editInternal.value = c.internalNotes ?? ''
  editDraftJson.value = c.draftLineItems?.length
    ? JSON.stringify(c.draftLineItems, null, 2)
    : ''
}, { immediate: true })

let aiPollTimer: ReturnType<typeof setInterval> | null = null

function stopAiPoll() {
  if (aiPollTimer) {
    clearInterval(aiPollTimer)
    aiPollTimer = null
  }
}

function startAiPoll() {
  stopAiPoll()
  aiPollTimer = setInterval(async () => {
    await refreshAi()
    if (pendingExtraction.value || !extractBusy.value) stopAiPoll()
  }, 2000)
}

onBeforeUnmount(() => stopAiPoll())

async function runExtraction() {
  if (!canExtract.value) return
  extractBusy.value = true
  extractError.value = ''
  try {
    await $fetch(`/api/service-logs/${id}/ai-extract`, {
      method: 'POST',
      body: { fileId: selectedFileId.value ?? undefined },
    })
    startAiPoll()
    await refreshAi()
  }
  catch (e: unknown) {
    extractError.value = (e as { data?: { message?: string } })?.data?.message ?? 'AI extraction failed — enter details manually'
  }
  finally {
    extractBusy.value = false
  }
}

function buildExtractionContent() {
  let draftLineItems: unknown[] | undefined
  if (editDraftJson.value.trim()) {
    draftLineItems = JSON.parse(editDraftJson.value) as unknown[]
  }
  return {
    complaint: editComplaint.value || null,
    internalNotes: editInternal.value || null,
    draftLineItems,
    fileId: selectedFileId.value ?? undefined,
  }
}

async function reviewExtraction(action: 'accept' | 'edit' | 'reject') {
  const suggestion = pendingExtraction.value
  if (!suggestion) return
  extractBusy.value = true
  extractError.value = ''
  try {
    const body: Record<string, unknown> = { action }
    if (action === 'edit' || action === 'accept') {
      body.content = action === 'edit' ? buildExtractionContent() : suggestion.suggestedContent
    }
    await $fetch(`/api/ai/suggestions/${suggestion.id}/review`, { method: 'POST', body })
    await Promise.all([refresh(), refreshAi()])
  }
  catch (e: unknown) {
    if (action === 'edit' && (e as Error).message?.includes('JSON')) {
      extractError.value = 'Draft line items must be valid JSON'
    }
    else {
      extractError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Review failed'
    }
  }
  finally {
    extractBusy.value = false
  }
}

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

function openLightbox(fileId: string) {
  selectedFileId.value = fileId
  lightboxOpen.value = true
}

function previewUrl(fileId: string) {
  return `/api/files/${fileId}/preview`
}

const pill = computed(() => log.value ? serviceLogStatusPill(log.value.status) : { cls: 'pill gray', label: '—' })
</script>

<template>
  <section v-if="error" class="page active">
    <div class="empty">Service log not found or you do not have access.</div>
  </section>

  <section v-else-if="log" class="page active">
    <div class="pagehead">
      <div>
        <h2>
          {{ logNumberDisplay(log.logNumber) }}
          <span :class="pill.cls" style="vertical-align:3px">{{ pill.label }}</span>
        </h2>
        <p>
          <NuxtLink to="/service-logs">Service Logs</NuxtLink>
          / {{ vehicleTag(log.vehicle) }} · {{ log.customerName }}
        </p>
      </div>
      <div class="actions">
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
          v-if="canReview && log.status === 'ready_for_review'"
          class="btn"
          type="button"
          :disabled="busy"
          @click="changeStatus('in_review')"
        >
          Start review
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
        <button
          v-if="canReview && ['in_review', 'ready_for_review'].includes(log.status)"
          class="btn"
          type="button"
          :disabled="busy"
          @click="changeStatus('approved_for_invoice')"
        >
          Approve for invoice
        </button>
        <button
          v-if="canConvert && log.status === 'approved_for_invoice'"
          class="btn primary"
          type="button"
          :disabled="busy"
          @click="convertToInvoice"
        >
          Convert to invoice
        </button>
        <NuxtLink
          v-if="log.status === 'converted_to_invoice' && log.invoiceId"
          :to="`/invoices/${log.invoiceId}`"
          class="btn"
        >
          View invoice
        </NuxtLink>
        <NuxtLink
          v-if="log.status === 'converted_to_invoice' && log.invoiceId"
          :to="`/invoices/${log.invoiceId}/edit`"
          class="btn primary"
        >
          Edit invoice
        </NuxtLink>
        <DeleteEntityButton
          v-if="log.status !== 'archived' && !log.invoiceId"
          entity-type="service_log"
          :entity-id="log.id"
          :entity-label="logNumberDisplay(log.logNumber)"
          :disabled="busy"
        />
      </div>
    </div>

    <p v-if="actionError" class="help" style="color:#dc2626; margin:-8px 0 16px;">{{ actionError }}</p>
    <p v-if="convertFlash" class="flash ok" style="margin:-8px 0 16px;">
      Invoice created and linked to this service log. The log stays on file.
      <NuxtLink :to="`/invoices/${convertFlash}`">View invoice</NuxtLink>
      ·
      <NuxtLink :to="`/invoices/${convertFlash}/edit`">Edit invoice</NuxtLink>
    </p>
    <p
      v-else-if="log.status === 'converted_to_invoice' && log.invoiceId"
      class="flash ok"
      style="margin:-8px 0 16px;"
    >
      This service log is linked to an invoice and remains on file.
      <NuxtLink :to="`/invoices/${log.invoiceId}`">View invoice</NuxtLink>
    </p>
    <p v-if="log.statusReason" class="help" style="margin:-8px 0 16px;">
      Review note: {{ log.statusReason }}
    </p>

    <div class="cols sl-detail-cols">
      <div class="stack">
        <div v-if="imageFiles.length" class="card sl-review-split">
          <div class="chead"><h3>Image review</h3></div>
          <div class="cbody sl-review-body">
            <div class="sl-review-main">
              <img
                v-if="selectedFile"
                :src="previewUrl(selectedFile.id)"
                :alt="selectedFile.originalFilename"
                class="sl-review-img"
              >
            </div>
            <div class="sl-review-side">
              <div class="photos sl-review-thumbs">
                <button
                  v-for="f in imageFiles"
                  :key="f.id"
                  type="button"
                  class="photo sl-review-thumb"
                  :class="{ on: f.id === selectedFile?.id }"
                  @click="selectedFileId = f.id"
                >
                  <img :src="previewUrl(f.id)" :alt="f.originalFilename">
                </button>
              </div>
              <p v-if="log.complaint" style="margin:12px 0 0; font-size:13px; color:#475569; line-height:1.55;">
                <b style="display:block; font-size:11px; color:#94a3b8; margin-bottom:4px;">COMPLAINT</b>
                {{ log.complaint }}
              </p>

              <div v-if="canExtract" class="sl-ai-panel">
                <div class="sl-ai-head">
                  <b>✦ AI extraction</b>
                  <button
                    type="button"
                    class="btn sm"
                    :disabled="extractBusy || !imageFiles.length"
                    @click="runExtraction"
                  >
                    {{ extractBusy && !pendingExtraction ? 'Running…' : 'Extract from image' }}
                  </button>
                </div>
                <p v-if="extractError" class="help" style="color:#dc2626; margin:0 0 8px;">{{ extractError }}</p>
                <p v-else-if="!pendingExtraction" class="help" style="margin:0;">
                  Suggest fields from the selected photo — accept, edit, or reject. Manual entry always works if AI fails.
                </p>

                <div v-if="pendingExtraction" class="sl-review">
                  <div class="r stack">
                    <span class="k">Suggested complaint</span>
                    <textarea v-model="editComplaint" rows="2" class="sl-ai-field" />
                  </div>
                  <div class="r stack">
                    <span class="k">Suggested internal notes</span>
                    <textarea v-model="editInternal" rows="2" class="sl-ai-field" />
                  </div>
                  <div class="r stack">
                    <span class="k">Draft lines (JSON)</span>
                    <textarea v-model="editDraftJson" rows="3" class="sl-ai-field mono" placeholder="[]" />
                  </div>
                  <div class="sl-ai-acts">
                    <button type="button" class="btn sm primary" :disabled="extractBusy" @click="reviewExtraction('accept')">
                      Accept
                    </button>
                    <button type="button" class="btn sm" :disabled="extractBusy" @click="reviewExtraction('edit')">
                      Accept with edits
                    </button>
                    <button type="button" class="btn sm" :disabled="extractBusy" @click="reviewExtraction('reject')">
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="chead"><h3>Uploaded files · {{ files.length }}</h3></div>
          <div class="cbody">
            <div class="photos">
              <button
                v-for="f in files"
                :key="f.id"
                type="button"
                class="photo"
                @click="f.mimeType.startsWith('image/') ? openLightbox(f.id) : undefined"
              >
                <img
                  v-if="f.mimeType.startsWith('image/')"
                  :src="previewUrl(f.id)"
                  :alt="f.originalFilename"
                  style="width:100%; height:100%; object-fit:cover; border-radius:10px;"
                >
                <span v-else>{{ fileThumbEmoji(f.mimeType, f.fileKind) }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="chead"><h3>Customer complaint / symptoms</h3></div>
          <div class="cbody" style="font-size:13.5px; color:#475569; line-height:1.6;">
            {{ log.complaint || '—' }}
          </div>
        </div>

        <div v-if="canReview" class="card">
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
                <tr><th>Description</th><th>Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
              </thead>
              <tbody>
                <tr v-for="(line, i) in draftLines" :key="i">
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

    <div class="lightbox" :class="{ open: lightboxOpen }" @click="lightboxOpen = false">
      <div class="inner" @click.stop>
        <img
          v-if="selectedFile"
          :src="previewUrl(selectedFile.id)"
          :alt="selectedFile.originalFilename"
          style="max-width:100%; max-height:70vh; display:block; margin:0 auto;"
        >
        <p style="margin:12px 0 0; text-align:center; font-size:13px; color:#64748b;">{{ selectedFile?.originalFilename }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sl-review-body {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  align-items: start;
}
.sl-review-main {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  min-height: 240px;
  display: grid;
  place-items: center;
}
.sl-review-img {
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  display: block;
}
.sl-review-thumbs .photo {
  cursor: pointer;
  padding: 0;
  overflow: hidden;
}
.sl-review-thumbs .photo.on {
  outline: 3px solid #4f46e5;
  outline-offset: 2px;
}
.sl-review-thumbs img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (max-width: 720px) {
  .sl-review-body {
    grid-template-columns: 1fr;
  }
}
.sl-ai-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}
.sl-ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.sl-ai-head b { font-size: 12px; color: #4f46e5; }
.sl-ai-field {
  width: 100%;
  font: inherit;
  font-size: 12.5px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  resize: vertical;
  color: #334155;
}
.sl-ai-field.mono { font-family: "IBM Plex Mono", monospace; font-size: 11px; }
.sl-ai-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
</style>
