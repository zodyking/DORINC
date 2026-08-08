<script setup lang="ts">
import { STAPLES_PRINTME_IMAP_POLL_MS } from '#shared/staples-printme'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

type StaplesJob = {
  id: string
  status: string
  releaseCode: string | null
  errorMessage: string | null
  locatorUrl: string
  expiresAt: string | null
  hasBarcode?: boolean
  awaitingReply?: boolean
}

const jobs = ref<StaplesJob[]>([])
const loadError = ref('')
const dismissBusyId = ref<string | null>(null)
const barcodeOpen = ref(false)
const barcodeJob = ref<StaplesJob | null>(null)
const barcodeUrl = ref('')
const barcodeError = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

const hasJobs = computed(() => jobs.value.length > 0)
const awaitingAny = computed(() => jobs.value.some(j =>
  j.awaitingReply || ['queued', 'emailed', 'awaiting_reply'].includes(j.status),
))

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function revokeBarcodeUrl() {
  if (barcodeUrl.value) {
    URL.revokeObjectURL(barcodeUrl.value)
    barcodeUrl.value = ''
  }
}

async function refreshJobs() {
  try {
    const res = await $fetch<{ jobs: StaplesJob[] }>('/api/service-logs/sheet/staples-print')
    jobs.value = res.jobs || []
    loadError.value = ''
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
  revokeBarcodeUrl()
  try {
    const blob = await $fetch<Blob>(`/api/service-logs/sheet/staples-print/${job.id}/barcode`, {
      responseType: 'blob',
    })
    barcodeUrl.value = URL.createObjectURL(blob)
  }
  catch (e: unknown) {
    barcodeError.value = syncFetchErrorMessage(e, 'Could not load barcode')
  }
}

function closeBarcode() {
  barcodeOpen.value = false
  barcodeJob.value = null
  barcodeError.value = ''
  revokeBarcodeUrl()
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
  revokeBarcodeUrl()
})
</script>

<template>
  <section class="staples-panel" aria-label="Active Staples print orders">
    <p v-if="loadError" class="help staples-panel-error">{{ loadError }}</p>

    <div v-if="!hasJobs && !loadError" class="staples-panel-empty">
      <p>No active Staples PrintMe orders.</p>
      <p class="help">
        Send a blank service log sheet from here or Service Logs → Print Template.
        When PrintMe replies, the 8-character release code appears here.
      </p>
    </div>

    <div
      v-for="job in jobs"
      :key="job.id"
      class="staples-panel-row"
    >
      <div class="staples-panel-main">
        <p class="staples-panel-label">
          {{ awaitingAny && !job.releaseCode ? 'Awaiting PrintMe' : 'Release code' }}
        </p>
        <template v-if="job.releaseCode">
          <p class="staples-panel-code">{{ job.releaseCode }}</p>
          <button type="button" class="btn linkish" @click="openBarcode(job)">
            Click to see barcode
          </button>
          <p v-if="job.status === 'expired'" class="staples-panel-wait">Expired — remove when done</p>
        </template>
        <template v-else-if="job.status === 'failed'">
          <p class="staples-panel-wait">{{ job.errorMessage || 'PrintMe send failed' }}</p>
        </template>
        <template v-else>
          <p class="staples-panel-wait">
            Waiting for confirmation from no-reply@printme.com…
          </p>
        </template>
      </div>
      <button
        type="button"
        class="btn"
        :disabled="dismissBusyId === job.id"
        @click="requestRemoval(job)"
      >
        {{ dismissBusyId === job.id ? 'Removing…' : 'Request removal' }}
      </button>
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
            v-if="barcodeUrl"
            :src="barcodeUrl"
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
  </section>
</template>

<style scoped>
.staples-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.staples-panel-empty {
  padding: 18px 16px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}
.staples-panel-empty p {
  margin: 0 0 6px;
  color: #0f172a;
  font-size: 14px;
}
.staples-panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.staples-panel-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 14px;
  min-width: 0;
}
.staples-panel-label {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
}
.staples-panel-code {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.staples-panel-wait {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}
.staples-panel-error {
  color: #b91c1c;
  margin: 0;
}
.btn.linkish {
  border: none;
  background: transparent;
  color: #1d4ed8;
  padding: 0;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.btn.linkish:hover {
  color: #1e40af;
}
.staples-barcode-modal {
  width: min(420px, 94vw);
}
.staples-barcode-body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
  background: #fff;
}
.staples-barcode-img {
  max-width: 100%;
  height: auto;
  image-rendering: pixelated;
}
@media (max-width: 560px) {
  .staples-panel-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
