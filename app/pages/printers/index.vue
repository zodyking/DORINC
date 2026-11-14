<script setup lang="ts">
import PdfViewerDialog from '~/components/PdfViewerDialog.client.vue'
import PrinterStation from '~/components/printers/PrinterStation.vue'
import StaplesPrintJobsPanel from '~/components/staples/StaplesPrintJobsPanel.vue'
import StaffNavIcon from '~/components/staff/StaffNavIcon.vue'
import { syncFetchErrorMessage, fetchErrorMessage } from '~/utils/fetch-blob-error'
import { printPdfBlob } from '~/utils/print-pdf'
import { fetchServiceLogSheetPdf } from '~/utils/service-log-sheet'
import {
  formatPrinterWhen,
  printerLiveLabel,
  printerLiveTone,
  printersBusy,
  printerStatusClass,
  type PrinterJob,
  type PrintersPage,
} from '~/utils/printers-ui'
import {
  JOB_LABELS,
  SIDE_LABELS,
  type PrintPageTab,
} from '#shared/printers'

definePageMeta({ layout: 'staff', permission: ['printers.read.all', 'staples.read.all'] })

const SETTINGS_TABS = new Set(['devices', 'printers-setup', 'email', 'tailscale'])

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canPrinters = computed(() => auth.can('printers.read.all'))
const canPrint = computed(() => auth.can('printers.print.all'))
const canStaples = computed(() => auth.can('staples.read.all'))
const canStaplesPrint = computed(() => auth.can('staples.print.all'))
const canAdmin = computed(() => auth.can('system.admin.all'))
const canManage = computed(() => auth.can('printers.manage.all'))

const availableTabs = computed(() => {
  const items: Array<{ id: PrintPageTab, label: string }> = []
  if (canPrinters.value) items.push({ id: 'printers', label: 'Shop printers' })
  if (canStaples.value) items.push({ id: 'staples', label: 'Staples' })
  return items
})

const tab = computed<PrintPageTab>(() => {
  const raw = String(route.query.tab || '')
  if (raw === 'staples' && canStaples.value) return 'staples'
  if (canPrinters.value) return 'printers'
  return 'staples'
})

watch(
  () => String(route.query.tab || ''),
  (raw) => {
    if (SETTINGS_TABS.has(raw)) {
      if (canAdmin.value) {
        void router.replace({ path: '/admin', query: { tab: 'printers' } })
        return
      }
      void router.replace({ query: { ...route.query, tab: undefined } })
      return
    }
    if (raw === 'overview' || raw === 'jobs') {
      void router.replace({ query: { ...route.query, tab: undefined } })
    }
  },
  { immediate: true },
)

const page = ref<PrintersPage | null>(null)
const loadError = ref('')
const flashOk = ref('')
const flashErr = ref('')
const busy = ref('')
const printForm = reactive({ queue: '', sides: 'one-sided', copies: 1, file: null as File | null })
const jobsPanel = ref<{ refresh: () => Promise<void> } | null>(null)
const printOpen = ref(false)
const sendBusy = ref(false)
const blankBusy = ref('')
const deviceBusy = ref(false)
const { send: sendToPrinter, load: loadTargets } = usePrintTargets()
const printingBlank = computed(() => sendBusy.value || deviceBusy.value || Boolean(blankBusy.value))
const viewer = reactive({ open: false, blob: null as Blob | null, title: '', filename: 'document.pdf', busy: 0 })

const fileLabel = computed(() => printForm.file?.name || '')
const liveCupsJobs = computed(() => (page.value?.active_jobs.ok ? page.value.active_jobs.lines : []))
const readyPrinters = computed(() => (page.value?.printers || []).filter(printer => printer.ready))

async function load() {
  if (!canPrinters.value || tab.value !== 'printers') return
  loadError.value = ''
  try {
    const data = await $fetch<PrintersPage>('/api/printers', { query: { tab: 'overview' } })
    page.value = data
    const ready = data.printers.filter(printer => printer.ready)
    if (!ready.some(printer => printer.queue === printForm.queue)) printForm.queue = ready[0]?.queue || ''
  }
  catch (e: unknown) {
    loadError.value = syncFetchErrorMessage(e, 'Could not load printers')
  }
}

function goTab(id: PrintPageTab) {
  router.replace({ query: { ...route.query, tab: id === 'printers' ? undefined : id } })
}

async function withBusy(key: string, fn: () => Promise<string | undefined>) {
  busy.value = key
  flashOk.value = ''
  flashErr.value = ''
  try {
    const notice = await fn()
    if (notice) flashOk.value = notice
    await load()
  }
  catch (e: unknown) {
    flashErr.value = syncFetchErrorMessage(e, 'That action failed')
  }
  finally {
    busy.value = ''
  }
}

async function uploadJob() {
  if (!printForm.file || !printForm.queue) return
  const data = new FormData()
  data.append('file', printForm.file)
  data.append('queue', printForm.queue)
  data.append('sides', printForm.sides)
  data.append('copies', String(printForm.copies))
  await withBusy('upload', async () => {
    await $fetch('/api/printers/jobs', { method: 'POST', body: data })
    printForm.file = null
    return 'Document added to the queue'
  })
}

async function retryJob(id: number) {
  await withBusy(`retry-${id}`, async () => {
    await $fetch(`/api/printers/jobs/${id}/retry`, { method: 'POST' })
    return 'Job queued again'
  })
}

async function cancelJob(id: number) {
  await withBusy(`cancel-${id}`, async () => {
    await $fetch(`/api/printers/jobs/${id}/cancel`, { method: 'POST' })
    return 'Job cancelled'
  })
}

async function sendBlankToPrinter(queue: string, label: string) {
  if (!canPrint.value || blankBusy.value) return
  blankBusy.value = queue
  flashErr.value = ''
  flashOk.value = ''
  try {
    await sendToPrinter({ kind: 'service-log-sheet', queue })
    flashOk.value = `Blank sheet sent to ${label}`
    await load()
  }
  catch (e: unknown) {
    flashErr.value = syncFetchErrorMessage(e, `Could not send to ${label}`)
  }
  finally {
    blankBusy.value = ''
  }
}

async function viewJob(job: PrinterJob) {
  if (viewer.busy) return
  viewer.busy = job.id
  flashErr.value = ''
  try {
    viewer.blob = await $fetch<Blob>(`/api/printers/jobs/${job.id}/file`, { responseType: 'blob' })
    viewer.title = job.filename
    viewer.filename = job.filename.replace(/\.[A-Za-z0-9]{1,5}$/, '') + '.pdf'
    viewer.open = true
  }
  catch (e: unknown) {
    flashErr.value = syncFetchErrorMessage(e, 'Could not open the document')
  }
  finally {
    viewer.busy = 0
  }
}

function printerName(queue: string) {
  return page.value?.printers.find(printer => printer.queue === queue)?.label || queue
}

function closeViewer() {
  viewer.open = false
  viewer.blob = null
}

async function deleteJob(job: PrinterJob) {
  if (!confirm(`Delete "${job.filename}" from print history? The copy kept for the printer is removed; the original invoice or record is not affected.`)) return
  await withBusy(`delete-${job.id}`, async () => {
    await $fetch(`/api/printers/jobs/${job.id}`, { method: 'DELETE' })
    return 'Removed from print history'
  })
}

async function printBlankFromDevice() {
  if (deviceBusy.value) return
  deviceBusy.value = true
  flashErr.value = ''
  flashOk.value = ''
  try {
    const blob = await fetchServiceLogSheetPdf()
    await printPdfBlob(blob)
  }
  catch (e: unknown) {
    flashErr.value = await fetchErrorMessage(e, 'Could not print the blank sheet')
  }
  finally {
    deviceBusy.value = false
  }
}

async function onBlankChoice(choice: { kind: 'device' } | { kind: 'staples' } | { kind: 'printer', queue: string, label: string }) {
  printOpen.value = false
  if (choice.kind === 'device') await printBlankFromDevice()
  else if (choice.kind === 'staples') await sendBlankSheet()
  else await sendBlankToPrinter(choice.queue, choice.label)
}

async function sendBlankSheet() {
  if (!canStaplesPrint.value || sendBusy.value) return
  sendBusy.value = true
  flashErr.value = ''
  flashOk.value = ''
  try {
    const res = await $fetch<{ job: { id: string, status: string, errorMessage: string | null } }>(
      '/api/service-logs/sheet/staples-print',
      { method: 'POST' },
    )
    if (res.job.status === 'failed') {
      flashErr.value = res.job.errorMessage || 'Could not email Staples PrintMe'
      return
    }
    flashOk.value = 'Sheet emailed to Staples PrintMe. Waiting for the release code…'
    await jobsPanel.value?.refresh()
  }
  catch (e: unknown) {
    flashErr.value = syncFetchErrorMessage(e, 'Could not start Staples PrintMe')
  }
  finally {
    sendBusy.value = false
  }
}

watch(tab, () => {
  void load()
  void loadTargets(true)
}, { immediate: true })

// Re-read often while a printer is being set up or a picture is being found.
let pollTimer: ReturnType<typeof setTimeout> | null = null
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    if (tab.value === 'printers' && !document.hidden) await load()
    schedulePoll()
  }, printersBusy(page.value) ? 3000 : 8000)
}
onMounted(schedulePoll)
watch(() => printersBusy(page.value), schedulePoll)
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<template>
  <section class="page active ph-page">
    <StaffPageHead subtitle="Live shop printers, job history, and Staples PrintMe">
      <template #title>
        <span class="printers-page-title">
          <StaffNavIcon name="printers" class="printers-page-logo" />
          Print
        </span>
      </template>
      <template v-if="canStaplesPrint || canPrint || canPrinters" #actions>
        <button
          type="button"
          class="btn"
          :disabled="printingBlank"
          @click="printOpen = true"
        >
          {{ printingBlank ? 'Printing…' : 'Print' }}
        </button>
      </template>
    </StaffPageHead>

    <PrintChooser
      v-model:open="printOpen"
      title="Print a blank sheet"
      lead="Choose where the blank service log should print."
      :show-device="canPrinters || canStaples"
      :show-staples="canStaplesPrint"
      :show-printers="canPrint"
      :busy="printingBlank"
      :error="flashErr"
      @choose="onBlankChoice"
    />

    <nav v-if="availableTabs.length > 1" class="ph-tabs" aria-label="Print sections">
      <button
        v-for="item in availableTabs"
        :key="item.id"
        type="button"
        class="ph-tab"
        :class="{ on: tab === item.id }"
        :aria-current="tab === item.id ? 'page' : undefined"
        @click="goTab(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <p v-if="loadError" class="help ph-flash ph-flash--err">{{ loadError }}</p>
    <p v-else-if="flashErr" class="help ph-flash ph-flash--err">{{ flashErr }}</p>
    <p v-else-if="flashOk" class="help ph-flash ph-flash--ok">{{ flashOk }}</p>

    <template v-if="tab === 'printers' && canPrinters">
      <template v-if="page">
        <p v-if="!page.engine.ok" class="ph-notice" role="status">
          <strong>Shop printing is not available right now.</strong> {{ page.engine.message }}
        </p>
        <p v-for="item in page.setups" :key="item.queue" class="ph-notice" :class="{ 'is-bad': item.error }" role="status">
          <template v-if="item.running"><span class="ph-spin" aria-hidden="true" /> Setting up <strong>{{ item.label }}</strong>: {{ item.phase || 'Working' }}…</template>
          <template v-else><strong>{{ item.label }}</strong> could not be added. {{ item.error }}</template>
        </p>
        <div v-if="page.printers.length" class="ph-stations">
          <article v-for="printer in page.printers" :key="printer.queue" class="ph-station">
            <header class="ph-station__head">
              <div>
                <h3>{{ printer.label }}</h3>
                <p>
                  {{ printer.identity || printer.host }}
                  <template v-if="printer.online && printer.stats?.pages_label"> · {{ printer.stats.pages_label }} pages</template>
                  <template v-if="printer.tail.online"> · {{ printer.tail.hostname || 'On the tailnet' }}</template>
                </p>
              </div>
              <span class="status-pill" :class="`is-${printerLiveTone(printer)}`">
                {{ printerLiveLabel(printer) }}
              </span>
            </header>
            <p v-if="printer.setup?.running" class="ph-notice" role="status">
              <span class="ph-spin" aria-hidden="true" /> {{ printer.setup.phase || 'Working' }}…
            </p>
            <p v-else-if="!printer.ready" class="ph-notice" role="status">
              This printer has not answered yet, so it cannot print. It is read again from Control Panel.
            </p>
            <PrinterStation
              :queue="printer.queue"
              :label="printer.label"
              :image-url="printer.image.url"
              :pending="printer.image.pending"
              :condition="printer.condition"
              :supply-url="printer.supply?.url"
              :checks="printer.stats?.checks"
            />
          </article>
        </div>
        <div v-else-if="page.engine.ok && !page.setups.length" class="ph-empty">
          <div class="ph-empty__stage">
            <img src="/printers/mfp.svg" alt="" width="280" height="210">
          </div>
          <h3>No shop printer yet</h3>
          <p>Toner, paper, and jobs show here once a printer is added.</p>
          <NuxtLink v-if="canAdmin && canManage" class="btn primary" :to="{ path: '/admin', query: { tab: 'printers' } }">Add a printer</NuxtLink>
        </div>

        <section v-if="liveCupsJobs.length" class="ph-live" aria-label="Jobs at the printer">
          <h3>At the printer</h3>
          <ul>
            <li v-for="line in liveCupsJobs" :key="line">{{ line }}</li>
          </ul>
        </section>

        <div v-if="page.printers.length" class="ph-work">
          <section class="ph-send">
            <header>
              <h3>Send a print</h3>
              <p>PDF, photos, and Office files go to the shop printer.</p>
            </header>
            <form v-if="canPrint" class="ph-form" @submit.prevent="uploadJob">
              <label class="ph-drop" :class="{ 'has-file': Boolean(fileLabel) }">
                <strong>{{ fileLabel || 'Drop or choose a document' }}</strong>
                <small>PDF, JPG, PNG, TIFF, WEBP, DOCX, XLSX, ODT, ODS, TXT</small>
                <input
                  required
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.docx,.xlsx,.odt,.ods,.txt"
                  @change="printForm.file = ($event.target as HTMLInputElement).files?.[0] || null"
                >
              </label>
              <fieldset class="ph-dest">
                <legend>Printer</legend>
                <p v-if="!readyPrinters.length" class="ph-muted">No printer is ready to print yet.</p>
                <label
                  v-for="printer in readyPrinters"
                  :key="printer.queue"
                  class="ph-dest-choice"
                  :class="{ on: printForm.queue === printer.queue }"
                >
                  <input v-model="printForm.queue" type="radio" :value="printer.queue" required>
                  <img :src="printer.image.url" alt="" width="48" height="48">
                  <span>
                    <b>{{ printer.label }}</b>
                    <small>{{ printerLiveLabel(printer) }}</small>
                  </span>
                </label>
              </fieldset>
              <div class="ph-row">
                <label>Layout
                  <select v-model="printForm.sides">
                    <option value="one-sided">Single-sided</option>
                    <option value="two-sided-long-edge">Two-sided, long edge</option>
                    <option value="two-sided-short-edge">Two-sided, short edge</option>
                  </select>
                </label>
                <label>Copies
                  <input v-model.number="printForm.copies" type="number" min="1" max="10">
                </label>
              </div>
              <button class="btn primary ph-send-btn" type="submit" :disabled="busy === 'upload' || !printForm.queue">
                {{ busy === 'upload' ? 'Sending…' : 'Print' }}
              </button>
            </form>
            <p v-else class="ph-muted">You can view printers, but printing requires the Print jobs permission.</p>
          </section>

          <section class="ph-queue">
            <header>
              <div>
                <h3>Print queue</h3>
                <p>A document waits here while the printer is offline or out of paper, then prints on its own.</p>
              </div>
              <span class="ph-count">{{ page.jobs.length }}</span>
            </header>
            <ul v-if="page.jobs.length" class="ph-jobs">
              <li v-for="job in page.jobs" :key="job.id" class="ph-job">
                <div class="ph-job__main">
                  <strong>{{ job.filename }}</strong>
                  <span>{{ formatPrinterWhen(job.created_at) }} · {{ printerName(job.queue) }} · {{ SIDE_LABELS[job.sides] || job.sides }} · {{ job.pages ?? '—' }} × {{ job.copies }}</span>
                  <span v-if="job.error" class="ph-job__err" :class="job.status === 'pending' ? 'wait' : 'err'">{{ job.error }}</span>
                </div>
                <div class="ph-job__meta">
                  <span :class="printerStatusClass(job.status)">{{ JOB_LABELS[job.status] || job.status }}</span>
                  <span class="ph-job__who">{{ job.sender || job.source }}</span>
                  <div class="ph-job__acts">
                    <button
                      v-if="job.has_file"
                      type="button"
                      class="textlink"
                      :disabled="viewer.busy === job.id"
                      @click="viewJob(job)"
                    >
                      {{ viewer.busy === job.id ? 'Opening…' : 'View' }}
                    </button>
                    <template v-if="canPrint">
                      <button v-if="job.status === 'error'" type="button" class="textlink" @click="retryJob(job.id)">Retry</button>
                      <button v-else-if="job.status === 'pending' && !job.cups_id" type="button" class="textlink" @click="cancelJob(job.id)">Cancel</button>
                      <button
                        v-if="job.status !== 'sending' && job.status !== 'preparing'"
                        type="button"
                        class="textlink textlink--danger"
                        :disabled="busy === `delete-${job.id}`"
                        @click="deleteJob(job)"
                      >
                        Delete
                      </button>
                    </template>
                  </div>
                </div>
              </li>
            </ul>
            <p v-else class="ph-muted ph-queue-empty">No print jobs yet.</p>
          </section>
        </div>
      </template>
      <p v-else-if="!loadError" class="ph-muted">Loading printers…</p>
    </template>

    <template v-else-if="tab === 'staples' && canStaples">
      <div class="card staples-page-card">
        <div class="chead">
          <h3>Active print orders</h3>
        </div>
        <div class="cbody">
          <StaplesPrintJobsPanel ref="jobsPanel" />
        </div>
      </div>
    </template>
    <ClientOnly>
      <PdfViewerDialog
        v-model:open="viewer.open"
        :blob="viewer.blob"
        :title="viewer.title || 'Printed document'"
        :download-filename="viewer.filename"
        @close="closeViewer"
      />
    </ClientOnly>
  </section>
</template>

<style scoped>
.printers-page-title { display: inline-flex; align-items: center; gap: 10px; }
.printers-page-logo { width: 22px; height: 22px; color: #4f46e5; }
.ph-tabs {
  display: flex;
  gap: 6px;
  margin: 0 0 18px;
  padding: 4px;
  width: fit-content;
  max-width: 100%;
  background: #f1f5f9;
  border-radius: 999px;
}
.ph-tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: #64748b;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.ph-tab.on { background: #fff; color: #0f172a; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); }
.ph-flash { margin: 0 0 14px; }
.ph-flash--err { color: #dc2626; }
.ph-flash--ok { color: #15803d; }
.ph-stations { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); }
.ph-station {
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 10px 30px -24px rgba(15, 23, 42, 0.45);
}
.ph-station__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.ph-station__head h3 { margin: 0; font-size: 1.15rem; letter-spacing: -0.03em; }
.ph-station__head p { margin: 4px 0 0; color: #64748b; font-size: 13px; font-weight: 500; }
.ph-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 28px 20px 32px;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  background:
    radial-gradient(80% 60% at 50% 0%, #eef2ff 0%, transparent 70%),
    #fff;
}
.ph-empty__stage {
  width: min(280px, 100%);
  border-radius: 20px;
  background: linear-gradient(180deg, #f8fafc, #e8eef6);
  padding: 12px;
  box-shadow: inset 0 1px 0 #fff;
}
.ph-empty__stage img { width: 100%; height: auto; display: block; }
.ph-empty h3 { margin: 8px 0 0; font-size: 1.2rem; letter-spacing: -0.03em; }
.ph-empty p { margin: 0; max-width: 28rem; color: #64748b; font-size: 14px; line-height: 1.45; }
.ph-live {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #0f172a;
  color: #e2e8f0;
}
.ph-live h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #94a3b8; }
.ph-live ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12.5px; }
.ph-work {
  margin-top: 16px;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 16px;
  align-items: start;
}
.ph-send, .ph-queue {
  border: 1px solid #e2e8f0;
  border-radius: 22px;
  background: #fff;
  padding: 16px;
  min-width: 0;
}
.ph-send header h3, .ph-queue header h3 { margin: 0; font-size: 1.05rem; letter-spacing: -0.02em; }
.ph-send header p, .ph-queue header p { margin: 4px 0 14px; color: #64748b; font-size: 13px; }
.ph-queue header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.ph-count {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 800;
  display: grid;
  place-items: center;
}
.ph-form { display: flex; flex-direction: column; gap: 12px; }
.ph-form label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #64748b; }
.ph-form input, .ph-form select {
  width: 100%; border: 1px solid #e2e8f0; border-radius: 12px; font: inherit; font-size: 14px;
  padding: 10px 12px; background: #f8fafc; color: #0f172a;
}
.ph-drop {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 22px 16px;
  border: 1.5px dashed #c7d2fe;
  border-radius: 16px;
  background: #eef2ff;
  text-align: center;
  color: #312e81;
  cursor: pointer;
}
.ph-drop.has-file { border-style: solid; background: #f5f3ff; }
.ph-drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.ph-drop small { font-weight: 500; color: #6366f1; }
.ph-dest { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
.ph-dest legend { font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 6px; }
.ph-dest-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
}
.ph-dest-choice.on { border-color: #c7d2fe; background: #eef2ff; }
.ph-dest-choice img {
  width: 48px; height: 48px; object-fit: contain; background: #fff; border-radius: 10px; border: 1px solid #e2e8f0;
}
.ph-dest-choice span { display: flex; flex-direction: column; gap: 2px; }
.ph-dest-choice b { color: #0f172a; font-size: 14px; }
.ph-dest-choice small { color: #64748b; font-weight: 600; }
.ph-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ph-send-btn { width: 100%; min-height: 44px; justify-content: center; }
.ph-jobs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.ph-job {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid #eef2f7;
  border-radius: 16px;
  background: #f8fafc;
}
.ph-job__main { display: grid; gap: 3px; min-width: 0; }
.ph-job__main strong { font-size: 14px; word-break: break-word; }
.ph-job__main span { color: #64748b; font-size: 12px; }
.ph-job__err.wait { color: #d97706; }
.ph-job__err.err { color: #dc2626; }
.ph-job__meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ph-job__who { color: #94a3b8; font-size: 12px; font-weight: 600; }
.ph-job__acts { margin-left: auto; display: inline-flex; gap: 14px; }
.ph-muted { color: #64748b; }
.ph-notice {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin: 0 0 14px; padding: 10px 14px; border-radius: 14px;
  background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; font-size: 13.5px;
}
.ph-notice.is-bad { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.ph-station .ph-notice { margin-bottom: 12px; }
.ph-spin {
  width: 14px; height: 14px; border-radius: 50%; flex: none;
  border: 2px solid #bfdbfe; border-top-color: #2563eb; animation: ph-spin .8s linear infinite;
}
@keyframes ph-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ph-spin { animation: none; } }
.ph-queue-empty { margin: 0; padding: 8px 0 4px; }
.status-pill {
  display: inline-flex; align-items: center; font-size: 11px; font-weight: 800;
  padding: 4px 9px; border-radius: 999px; background: #f1f5f9; color: #64748b;
}
.status-pill.is-online, .status-pill.is-success { background: #ecfdf5; color: #059669; }
.status-pill.is-offline, .status-pill.is-error { background: #fef2f2; color: #dc2626; }
.status-pill.is-warn, .status-pill.is-rejected { background: #fffbeb; color: #d97706; }
.status-pill.is-wait { background: #eff6ff; color: #2563eb; }
.textlink {
  appearance: none; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; color: #4f46e5;
}
.textlink--danger { color: #dc2626; }
.textlink:disabled { opacity: .55; cursor: default; }
.staples-page-card .cbody { padding-top: 14px; }
@media (max-width: 900px) {
  .ph-work { grid-template-columns: 1fr; }
  .ph-row { grid-template-columns: 1fr; }
  .ph-tabs { width: 100%; }
  .ph-tab { flex: 1; }
}
</style>
