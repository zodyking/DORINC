<script setup lang="ts">
import PdfViewerDialog from '~/components/PdfViewerDialog.client.vue'
import { STAPLES_PRINTME_IMAP_POLL_MS } from '#shared/staples-printme'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

type StaplesJob = {
  id: string
  status: string
  documentType?: string
  documentLabel?: string | null
  entityId?: string | null
  releaseCode: string | null
  errorMessage: string | null
  locatorUrl: string
  expiresAt: string | null
  hasBarcode?: boolean
  hasPdf?: boolean
  awaitingReply?: boolean
  attachmentFilename?: string | null
}

const jobs = ref<StaplesJob[]>([])
const loadError = ref('')
const dismissBusyId = ref<string | null>(null)
const barcodeUrls = ref<Record<string, string>>({})
const barcodeOpen = ref(false)
const barcodeJob = ref<StaplesJob | null>(null)
const barcodeModalUrl = ref('')
const barcodeError = ref('')
const pdfOpen = ref(false)
const pdfJob = ref<StaplesJob | null>(null)
const pdfBlob = ref<Blob | null>(null)
const pdfBusyId = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const hasJobs = computed(() => jobs.value.length > 0)

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function revokeAllBarcodeUrls() {
  for (const url of Object.values(barcodeUrls.value)) URL.revokeObjectURL(url)
  barcodeUrls.value = {}
}

function revokeBarcodeModalUrl() {
  if (barcodeModalUrl.value) {
    URL.revokeObjectURL(barcodeModalUrl.value)
    barcodeModalUrl.value = ''
  }
}

function documentTitle(job: StaplesJob) {
  if (job.documentLabel?.trim()) return job.documentLabel.trim()
  if (job.documentType === 'invoice') return 'Invoice'
  return 'Service log sheet'
}

function statusLabel(job: StaplesJob) {
  if (job.releaseCode) {
    if (job.status === 'expired') return 'Expired'
    return 'Ready at Staples'
  }
  if (job.status === 'failed') return 'Failed'
  return 'Awaiting PrintMe'
}

function statusPill(job: StaplesJob) {
  if (job.releaseCode && job.status !== 'expired') return 'pill ok'
  if (job.status === 'failed' || job.status === 'expired') return 'pill bad'
  return 'pill warn'
}

async function loadBarcodeForJob(job: StaplesJob) {
  if (!job.releaseCode || barcodeUrls.value[job.id]) return
  try {
    const blob = await $fetch<Blob>(`/api/service-logs/sheet/staples-print/${job.id}/barcode`, {
      responseType: 'blob',
    })
    barcodeUrls.value = {
      ...barcodeUrls.value,
      [job.id]: URL.createObjectURL(blob),
    }
  }
  catch {
    // Inline barcode is optional; modal can retry.
  }
}

async function hydrateBarcodes(list: StaplesJob[]) {
  const ready = list.filter(j => j.releaseCode)
  await Promise.all(ready.map(job => loadBarcodeForJob(job)))
  const liveIds = new Set(list.map(j => j.id))
  const next: Record<string, string> = {}
  for (const [id, url] of Object.entries(barcodeUrls.value)) {
    if (liveIds.has(id)) next[id] = url
    else URL.revokeObjectURL(url)
  }
  barcodeUrls.value = next
}

async function refreshJobs() {
  try {
    const res = await $fetch<{ jobs: StaplesJob[] }>('/api/service-logs/sheet/staples-print')
    jobs.value = res.jobs || []
    loadError.value = ''
    await hydrateBarcodes(jobs.value)
  }
  catch (e: unknown) {
    loadError.value = syncFetchErrorMessage(e, 'Could not load Staples print status')
  }
}

function startPoll() {
  stopPoll()
  if (!import.meta.client) return
  pollTimer = setInterval(() => { void refreshJobs() }, STAPLES_PRINTME_IMAP_POLL_MS)
}

async function openBarcode(job: StaplesJob) {
  if (!job.releaseCode) return
  barcodeJob.value = job
  barcodeOpen.value = true
  barcodeError.value = ''
  revokeBarcodeModalUrl()
  try {
    if (barcodeUrls.value[job.id]) {
      barcodeModalUrl.value = barcodeUrls.value[job.id]!
      return
    }
    const blob = await $fetch<Blob>(`/api/service-logs/sheet/staples-print/${job.id}/barcode`, {
      responseType: 'blob',
    })
    barcodeModalUrl.value = URL.createObjectURL(blob)
  }
  catch (e: unknown) {
    barcodeError.value = syncFetchErrorMessage(e, 'Could not load barcode')
  }
}

function closeBarcode() {
  const modalUrl = barcodeModalUrl.value
  barcodeOpen.value = false
  barcodeJob.value = null
  barcodeError.value = ''
  barcodeModalUrl.value = ''
  // Keep card thumbnail URLs; only revoke a modal-only blob.
  if (modalUrl && !Object.values(barcodeUrls.value).includes(modalUrl)) {
    URL.revokeObjectURL(modalUrl)
  }
}

async function openPdf(job: StaplesJob) {
  if (!job.hasPdf || pdfBusyId.value) return
  pdfBusyId.value = job.id
  try {
    const blob = await $fetch<Blob>(`/api/service-logs/sheet/staples-print/${job.id}/pdf`, {
      responseType: 'blob',
    })
    pdfBlob.value = blob
    pdfJob.value = job
    pdfOpen.value = true
  }
  catch (e: unknown) {
    loadError.value = syncFetchErrorMessage(e, 'Could not open the printed PDF')
  }
  finally {
    pdfBusyId.value = null
  }
}

function closePdf() {
  pdfOpen.value = false
  pdfJob.value = null
  pdfBlob.value = null
}

async function requestRemoval(job: StaplesJob) {
  if (dismissBusyId.value) return
  if (import.meta.client) {
    const ok = window.confirm(
      job.releaseCode
        ? `Remove Staples release code ${job.releaseCode} from this page?`
        : 'Remove this Staples print order from this page?',
    )
    if (!ok) return
  }
  dismissBusyId.value = job.id
  try {
    await $fetch(`/api/service-logs/sheet/staples-print/${job.id}`, { method: 'DELETE' })
    if (barcodeJob.value?.id === job.id) closeBarcode()
    if (pdfJob.value?.id === job.id) closePdf()
    await refreshJobs()
  }
  catch (e: unknown) {
    loadError.value = syncFetchErrorMessage(e, 'Could not remove Staples print order')
  }
  finally {
    dismissBusyId.value = null
  }
}

async function onStaplesSent() {
  await refreshJobs()
  startPoll()
}

defineExpose({ refresh: onStaplesSent })

onMounted(() => {
  void refreshJobs().then(() => startPoll())
})

onBeforeUnmount(() => {
  stopPoll()
  revokeAllBarcodeUrls()
  revokeBarcodeModalUrl()
})
</script>

<template>
  <section class="staples-panel" aria-label="Active Staples print orders">
    <p v-if="loadError" class="help staples-panel-error">{{ loadError }}</p>

    <div v-if="!hasJobs && !loadError" class="staples-panel-empty">
      <div class="staples-panel-empty__icon" aria-hidden="true">⎙</div>
      <p>No active Staples PrintMe orders</p>
      <p class="help">
        Send a blank service log sheet or print an invoice via Staples.
        When PrintMe replies, the release code and barcode appear here.
      </p>
    </div>

    <article
      v-for="job in jobs"
      :key="job.id"
      class="staples-card"
    >
      <button
        v-if="job.hasPdf"
        type="button"
        class="staples-card__pdf"
        :disabled="pdfBusyId === job.id"
        :aria-label="`Open PDF for ${documentTitle(job)}`"
        @click="openPdf(job)"
      >
        <span class="staples-card__pdf-badge">PDF</span>
        <span class="staples-card__pdf-title">{{ documentTitle(job) }}</span>
        <span class="staples-card__pdf-hint">
          {{ pdfBusyId === job.id ? 'Opening…' : 'Tap to preview' }}
        </span>
      </button>
      <div v-else class="staples-card__pdf staples-card__pdf--static">
        <span class="staples-card__pdf-badge">DOC</span>
        <span class="staples-card__pdf-title">{{ documentTitle(job) }}</span>
        <span class="staples-card__pdf-hint">Preview unavailable</span>
      </div>

      <div class="staples-card__body">
        <div class="staples-card__meta">
          <span :class="statusPill(job)">{{ statusLabel(job) }}</span>
          <span v-if="job.documentType === 'invoice'" class="pill info">Invoice</span>
          <span v-else class="pill gray">Service log</span>
        </div>

        <template v-if="job.releaseCode">
          <p class="staples-card__label">Release code</p>
          <p class="staples-card__code">{{ job.releaseCode }}</p>
          <button
            v-if="barcodeUrls[job.id] || job.hasBarcode"
            type="button"
            class="staples-card__barcode"
            aria-label="Open barcode larger"
            @click="openBarcode(job)"
          >
            <img
              v-if="barcodeUrls[job.id]"
              :src="barcodeUrls[job.id]"
              alt=""
              class="staples-card__barcode-img"
            >
            <span v-else class="help">Loading barcode…</span>
            <span class="staples-card__barcode-hint">Tap to enlarge</span>
          </button>
          <p v-if="job.status === 'expired'" class="staples-card__note">Expired — remove when finished at the store</p>
        </template>
        <template v-else-if="job.status === 'failed'">
          <p class="staples-card__note staples-panel-error">{{ job.errorMessage || 'PrintMe send failed' }}</p>
        </template>
        <template v-else>
          <p class="staples-card__note">
            Waiting for confirmation from PrintMe…
          </p>
        </template>
      </div>

      <div class="staples-card__actions">
        <button
          type="button"
          class="btn"
          :disabled="dismissBusyId === job.id"
          @click="requestRemoval(job)"
        >
          {{ dismissBusyId === job.id ? 'Removing…' : 'Remove' }}
        </button>
      </div>
    </article>

    <div
      v-if="barcodeOpen"
      id="staples-barcode-scrim"
      class="modal-scrim open"
      role="presentation"
      @click="(e) => { if ((e.target as HTMLElement).id === 'staples-barcode-scrim') closeBarcode() }"
    >
      <div
        class="modal staples-barcode-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staples-barcode-title"
        @click.stop
      >
        <div class="mhead">
          <div>
            <h3 id="staples-barcode-title">Staples release barcode</h3>
            <p v-if="barcodeJob?.releaseCode">Code {{ barcodeJob.releaseCode }}</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeBarcode">✕</button>
        </div>
        <div class="mbody staples-barcode-body">
          <img
            v-if="barcodeModalUrl"
            :src="barcodeModalUrl"
            alt="Staples PrintMe release barcode"
            class="staples-barcode-img"
          >
          <p v-else-if="barcodeError" class="help staples-panel-error">{{ barcodeError }}</p>
          <p v-else class="help">Loading barcode…</p>
        </div>
        <div class="mfoot">
          <button type="button" class="btn primary" @click="closeBarcode">Close</button>
        </div>
      </div>
    </div>

    <ClientOnly>
      <PdfViewerDialog
        v-model:open="pdfOpen"
        :blob="pdfBlob"
        :title="pdfJob ? documentTitle(pdfJob) : 'Staples print PDF'"
        :download-filename="pdfJob?.attachmentFilename || 'staples-print.pdf'"
        @close="closePdf"
      />
    </ClientOnly>
  </section>
</template>

<style scoped>
.staples-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.staples-panel-empty {
  padding: 28px 20px;
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  text-align: center;
}
.staples-panel-empty__icon {
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #eef2ff;
  color: #4338ca;
  font-size: 20px;
}
.staples-panel-empty p {
  margin: 0 0 6px;
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}
.staples-panel-empty .help {
  font-weight: 400;
  max-width: 36rem;
  margin: 0 auto;
}
.staples-card {
  display: grid;
  grid-template-columns: 140px 1fr auto;
  gap: 16px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  align-items: stretch;
}
.staples-card__pdf {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
  min-height: 160px;
  padding: 14px;
  border: 0;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  color: #fff;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.72)),
    linear-gradient(145deg, #e2e8f0 0%, #94a3b8 45%, #334155 100%);
}
.staples-card__pdf--static {
  cursor: default;
  opacity: 0.9;
}
.staples-card__pdf:not(:disabled):hover {
  filter: brightness(1.05);
}
.staples-card__pdf-badge {
  align-self: flex-start;
  margin-bottom: auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.staples-card__pdf-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}
.staples-card__pdf-hint {
  font-size: 11px;
  opacity: 0.85;
}
.staples-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.staples-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}
.staples-card__label {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
}
.staples-card__code {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
}
.staples-card__barcode {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  max-width: 280px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
}
.staples-card__barcode:hover {
  border-color: #cbd5e1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
}
.staples-card__barcode-img {
  width: 100%;
  height: auto;
  max-height: 72px;
  object-fit: contain;
  image-rendering: pixelated;
}
.staples-card__barcode-hint {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.staples-card__note {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.4;
}
.staples-card__actions {
  display: flex;
  align-items: flex-start;
}
.staples-panel-error {
  color: #b91c1c;
  margin: 0;
}
.staples-barcode-modal {
  width: min(480px, 94vw);
}
.staples-barcode-body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 160px;
  background: #fff;
  padding: 20px;
}
.staples-barcode-img {
  max-width: 100%;
  height: auto;
  image-rendering: pixelated;
}
@media (max-width: 720px) {
  .staples-card {
    grid-template-columns: 1fr;
  }
  .staples-card__pdf {
    min-height: 120px;
  }
  .staples-card__actions {
    justify-content: stretch;
  }
  .staples-card__actions .btn {
    width: 100%;
  }
}
</style>
