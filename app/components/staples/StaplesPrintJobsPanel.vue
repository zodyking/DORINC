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
  createdAt?: string
  createdByName?: string | null
  hasBarcode?: boolean
  hasPdf?: boolean
  awaitingReply?: boolean
  attachmentFilename?: string | null
}

const route = useRoute()
const jobs = ref<StaplesJob[]>([])
const loadError = ref('')
const dismissBusyId = ref<string | null>(null)
const barcodeUrls = ref<Record<string, string>>({})
const pdfPreviewUrls = ref<Record<string, string>>({})
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
const highlightJobId = computed(() => {
  const raw = route.query.job
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
})

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function revokeMap(map: Ref<Record<string, string>>) {
  for (const url of Object.values(map.value)) URL.revokeObjectURL(url)
  map.value = {}
}

function revokeBarcodeModalUrl() {
  if (barcodeModalUrl.value) {
    URL.revokeObjectURL(barcodeModalUrl.value)
    barcodeModalUrl.value = ''
  }
}

function documentTitle(job: StaplesJob) {
  if (job.documentLabel?.trim()) return job.documentLabel.trim()
  if (job.documentType === 'invoice' || job.documentType === 'invoice_batch') return 'Invoice'
  return 'Service log sheet'
}

function documentTypeLabel(job: StaplesJob) {
  if (job.documentType === 'invoice_batch') return 'Invoices'
  if (job.documentType === 'invoice') return 'Invoice'
  return 'Service log'
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

function orderDateDisplay(iso: string | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

async function loadBarcodeForJob(job: StaplesJob) {
  if (!job.releaseCode || barcodeUrls.value[job.id]) return
  try {
    const blob = await $fetch<Blob>(`/api/service-logs/sheet/staples-print/${job.id}/barcode`, {
      responseType: 'blob',
    })
    barcodeUrls.value = { ...barcodeUrls.value, [job.id]: URL.createObjectURL(blob) }
  }
  catch {
    // Optional on the card; modal can retry.
  }
}

async function loadPdfPreviewForJob(job: StaplesJob) {
  if (!job.hasPdf || pdfPreviewUrls.value[job.id]) return
  try {
    const blob = await $fetch<Blob>(`/api/service-logs/sheet/staples-print/${job.id}/pdf`, {
      responseType: 'blob',
    })
    pdfPreviewUrls.value = { ...pdfPreviewUrls.value, [job.id]: URL.createObjectURL(blob) }
  }
  catch {
    // Leave placeholder; tap-to-open can surface the error.
  }
}

async function hydrateMedia(list: StaplesJob[]) {
  await Promise.all([
    ...list.filter(j => j.releaseCode).map(job => loadBarcodeForJob(job)),
    ...list.filter(j => j.hasPdf).map(job => loadPdfPreviewForJob(job)),
  ])
  const liveIds = new Set(list.map(j => j.id))
  for (const map of [barcodeUrls, pdfPreviewUrls]) {
    const next: Record<string, string> = {}
    for (const [id, url] of Object.entries(map.value)) {
      if (liveIds.has(id)) next[id] = url
      else URL.revokeObjectURL(url)
    }
    map.value = next
  }
}

async function scrollToHighlightedJob() {
  if (!import.meta.client || !highlightJobId.value) return
  await nextTick()
  document.getElementById(`staples-job-${highlightJobId.value}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

async function refreshJobs() {
  try {
    const res = await $fetch<{ jobs: StaplesJob[] }>('/api/service-logs/sheet/staples-print')
    jobs.value = res.jobs || []
    loadError.value = ''
    await hydrateMedia(jobs.value)
    await scrollToHighlightedJob()
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
  if (modalUrl && !Object.values(barcodeUrls.value).includes(modalUrl)) {
    URL.revokeObjectURL(modalUrl)
  }
}

async function openPdf(job: StaplesJob) {
  if (!job.hasPdf || pdfBusyId.value) return
  pdfBusyId.value = job.id
  try {
    let blob: Blob
    if (pdfPreviewUrls.value[job.id]) {
      const res = await fetch(pdfPreviewUrls.value[job.id]!)
      blob = await res.blob()
    }
    else {
      blob = await $fetch<Blob>(`/api/service-logs/sheet/staples-print/${job.id}/pdf`, {
        responseType: 'blob',
      })
      pdfPreviewUrls.value = { ...pdfPreviewUrls.value, [job.id]: URL.createObjectURL(blob) }
    }
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
  revokeMap(barcodeUrls)
  revokeMap(pdfPreviewUrls)
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

    <div v-else class="staples-panel__grid">
      <article
        v-for="job in jobs"
        :id="`staples-job-${job.id}`"
        :key="job.id"
        class="staples-card"
        :class="{ 'staples-card--highlight': highlightJobId === job.id }"
      >
        <button
          v-if="job.hasPdf"
          type="button"
          class="staples-card__pdf"
          :disabled="pdfBusyId === job.id"
          :aria-label="`Open PDF for ${documentTitle(job)}`"
          @click="openPdf(job)"
        >
          <iframe
            v-if="pdfPreviewUrls[job.id]"
            class="staples-card__pdf-frame"
            :src="`${pdfPreviewUrls[job.id]}#toolbar=0&navpanes=0&scrollbar=0`"
            title=""
            tabindex="-1"
          />
          <div class="staples-card__pdf-shade">
            <span class="staples-card__pdf-badge">PDF</span>
            <span class="staples-card__pdf-title">{{ documentTitle(job) }}</span>
            <span class="staples-card__pdf-hint">
              {{ pdfBusyId === job.id ? 'Opening…' : (pdfPreviewUrls[job.id] ? 'Tap to enlarge' : 'Loading preview…') }}
            </span>
          </div>
        </button>
        <div v-else class="staples-card__pdf staples-card__pdf--static">
          <span class="staples-card__pdf-badge">DOC</span>
          <span class="staples-card__pdf-title">{{ documentTitle(job) }}</span>
          <span class="staples-card__pdf-hint">Preview unavailable</span>
        </div>

        <div class="staples-card__body">
          <div class="staples-card__top">
            <div class="staples-card__meta">
              <span :class="statusPill(job)">{{ statusLabel(job) }}</span>
              <span
                class="pill"
                :class="job.documentType === 'invoice' || job.documentType === 'invoice_batch' ? 'info' : 'gray'"
              >
                {{ documentTypeLabel(job) }}
              </span>
            </div>
            <button
              type="button"
              class="btn"
              :disabled="dismissBusyId === job.id"
              @click="requestRemoval(job)"
            >
              {{ dismissBusyId === job.id ? 'Removing…' : 'Remove' }}
            </button>
          </div>

          <div class="staples-card__who">
            <p class="staples-card__label">Ordered by</p>
            <p class="staples-card__who-name">{{ job.createdByName?.trim() || 'Staff' }}</p>
            <p class="staples-card__who-date">{{ orderDateDisplay(job.createdAt) }}</p>
          </div>

          <template v-if="job.releaseCode">
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
              <span class="staples-card__barcode-code">{{ job.releaseCode }}</span>
              <span class="staples-card__barcode-hint">Tap to enlarge</span>
            </button>
            <p v-if="job.status === 'expired'" class="staples-card__note">Expired — remove when finished at the store</p>
          </template>
          <template v-else-if="job.status === 'failed'">
            <p class="staples-card__note staples-panel-error">{{ job.errorMessage || 'PrintMe send failed' }}</p>
          </template>
          <template v-else>
            <p class="staples-card__note">Waiting for confirmation from PrintMe…</p>
          </template>
        </div>
      </article>
    </div>

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
  gap: 12px;
}
.staples-panel__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
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
  grid-template-columns: 148px minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  align-items: stretch;
}
.staples-card--highlight {
  border-color: #a5b4fc;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16);
}
.staples-card__pdf {
  position: relative;
  display: block;
  overflow: hidden;
  min-height: 200px;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(145deg, #e2e8f0 0%, #94a3b8 45%, #334155 100%);
}
.staples-card__pdf--static {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
  padding: 14px;
  cursor: default;
  opacity: 0.9;
}
.staples-card__pdf:not(:disabled):hover {
  filter: brightness(1.03);
}
.staples-card__pdf-frame {
  position: absolute;
  inset: -8% -20% auto -20%;
  width: 140%;
  height: 160%;
  border: 0;
  pointer-events: none;
  background: #fff;
}
.staples-card__pdf-shade {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 4px;
  padding: 12px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.05) 35%, rgba(15, 23, 42, 0.78) 100%);
}
.staples-card__pdf-badge {
  align-self: flex-start;
  margin-bottom: auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
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
  opacity: 0.9;
}
.staples-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.staples-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.staples-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.staples-card__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.staples-card__label {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
}
.staples-card__who-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}
.staples-card__who-date {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}
.staples-card__barcode {
  margin-top: 2px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: min(100%, 280px);
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
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
.staples-card__barcode-code {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
}
.staples-card__barcode-hint {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.staples-card__note {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.4;
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
@media (max-width: 900px) {
  .staples-panel__grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .staples-card {
    grid-template-columns: 1fr;
  }
  .staples-card__pdf {
    min-height: 140px;
  }
  .staples-card__top {
    flex-wrap: wrap;
  }
  .staples-card__top .btn {
    width: 100%;
  }
}
</style>
