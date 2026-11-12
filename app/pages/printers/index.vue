<script setup lang="ts">
import PrinterStation from '~/components/printers/PrinterStation.vue'
import StaplesPrintJobsPanel from '~/components/staples/StaplesPrintJobsPanel.vue'
import StaffNavIcon from '~/components/staff/StaffNavIcon.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  formatPrinterWhen,
  printerLiveLabel,
  printerStatusClass,
  type PrintersPage,
} from '~/utils/printers-ui'
import {
  JOB_LABELS,
  SIDE_LABELS,
  type PrintPageTab,
} from '#shared/printers'

definePageMeta({ layout: 'staff', permission: ['printers.read.all', 'staples.read.all'] })

const SETTINGS_TABS = new Set(['devices', 'email', 'tailscale'])

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canPrinters = computed(() => auth.can('printers.read.all'))
const canPrint = computed(() => auth.can('printers.print.all'))
const canStaples = computed(() => auth.can('staples.read.all'))
const canStaplesPrint = computed(() => auth.can('staples.print.all'))
const canAdmin = computed(() => auth.can('system.admin.all'))

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
const sendBusy = ref(false)

async function load() {
  if (!canPrinters.value || tab.value !== 'printers') return
  loadError.value = ''
  try {
    const data = await $fetch<PrintersPage>('/api/printers', { query: { tab: 'overview' } })
    page.value = data
    if (!printForm.queue && data.printers[0]) printForm.queue = data.printers[0].queue
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

async function retryJob(id: string) {
  await withBusy(`retry-${id}`, async () => {
    await $fetch(`/api/printers/jobs/${id}/retry`, { method: 'POST' })
    return 'Job queued again'
  })
}

async function cancelJob(id: string) {
  await withBusy(`cancel-${id}`, async () => {
    await $fetch(`/api/printers/jobs/${id}/cancel`, { method: 'POST' })
    return 'Job cancelled'
  })
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

watch(tab, () => { void load() }, { immediate: true })

let pollTimer: ReturnType<typeof setInterval> | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  pollTimer = setInterval(() => {
    if (tab.value === 'printers') void load()
  }, 8000)
})
watch(() => page.value?.printers.some(printer => printer.image.pending), (pending) => {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (pending) pendingTimer = setTimeout(() => { void load() }, 3000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (pendingTimer) clearTimeout(pendingTimer)
})
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Shop printer status, job history, and Staples PrintMe">
      <template #title>
        <span class="printers-page-title">
          <StaffNavIcon name="printers" class="printers-page-logo" />
          Print
        </span>
      </template>
      <template #actions>
        <NuxtLink v-if="canAdmin && tab === 'printers'" to="/admin?tab=printers" class="btn">Printer settings</NuxtLink>
        <button
          v-if="tab === 'staples' && canStaplesPrint"
          type="button"
          class="btn primary"
          :disabled="sendBusy"
          @click="sendBlankSheet"
        >
          {{ sendBusy ? 'Sending…' : 'Send blank sheet to PrintMe' }}
        </button>
      </template>
    </StaffPageHead>

    <nav v-if="availableTabs.length > 1" class="ph-tabs" aria-label="Print sections">
      <button
        v-for="item in availableTabs"
        :key="item.id"
        type="button"
        class="chip"
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
        <div v-if="page.printers.length" class="stack">
          <article v-for="printer in page.printers" :key="printer.queue" class="card">
            <div class="chead">
              <div>
                <h3>{{ printer.label }}</h3>
                <p class="ph-sub">
                  {{ printer.identity || printer.host }}
                  <template v-if="printer.online && printer.stats?.pages_label"> · {{ printer.stats.pages_label }} pages</template>
                  <template v-if="printer.tail.online"> · {{ printer.tail.hostname || 'On the tailnet' }}</template>
                  <template v-else-if="printer.tail.hostname"> · {{ printer.tail.hostname }} signed out</template>
                </p>
              </div>
              <span class="status-pill" :class="printer.online ? (printer.stats?.state === 'Stopped' ? 'is-warn' : 'is-online') : 'is-offline'">
                {{ printerLiveLabel(printer) }}
              </span>
            </div>
            <div class="cbody">
              <PrinterStation
                :queue="printer.queue"
                :label="printer.label"
                :image-url="printer.image.url"
                :pending="printer.image.pending"
                :condition="printer.condition"
                :supply-url="printer.supply?.url"
                :checks="printer.stats?.checks"
              />
            </div>
          </article>
        </div>
        <div v-else class="card">
          <div class="cbody ph-empty-art">
            <div class="ph-art-row">
              <img src="/printers/mono.svg" alt="Mono laser printer" width="140" height="105">
              <img src="/printers/mfp.svg" alt="Multifunction printer" width="140" height="105">
              <img src="/printers/color.svg" alt="Color printer" width="140" height="105">
            </div>
            <p class="empty">No printer yet. Add one in Control Panel → Printers and its picture, toner, and paper readings will show here.</p>
            <NuxtLink v-if="canAdmin" to="/admin?tab=printers" class="btn primary">Open printer settings</NuxtLink>
          </div>
        </div>

        <div class="cols ph-split">
          <div class="card">
            <div class="chead"><h3>Quick print</h3></div>
            <div class="cbody">
              <form v-if="canPrint && page.printers.length" class="ph-form" @submit.prevent="uploadJob">
                <label class="ph-upload">
                  <strong>Choose a document</strong>
                  <small>PDF, JPG, PNG, TIFF, WEBP, DOCX, XLSX, ODT, ODS, TXT</small>
                  <input
                    required
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.docx,.xlsx,.odt,.ods,.txt"
                    @change="printForm.file = ($event.target as HTMLInputElement).files?.[0] || null"
                  >
                </label>
                <fieldset class="ph-dest">
                  <legend>Destination</legend>
                  <label v-for="printer in page.printers" :key="printer.queue" class="ph-dest-choice">
                    <input v-model="printForm.queue" type="radio" :value="printer.queue" required>
                    <img :src="printer.image.url" alt="" width="40" height="40">
                    <span>{{ printer.label }}</span>
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
                <button class="btn primary" type="submit" :disabled="busy === 'upload'">
                  {{ busy === 'upload' ? 'Queuing…' : 'Add to queue' }}
                </button>
              </form>
              <p v-else-if="!canPrint" class="empty">You can view printers, but printing requires the Print jobs permission.</p>
              <p v-else class="empty">No printers configured.</p>
            </div>
          </div>
          <div class="card">
            <div class="chead">
              <div>
                <h3>Print queue</h3>
                <p class="ph-sub">Pending waits for the printer. Sent is already at the printer and cannot be cancelled.</p>
              </div>
              <span class="chip">{{ page.jobs.length }} recent jobs</span>
            </div>
            <div class="cbody" style="padding: 0">
              <div v-if="page.jobs.length" class="tscroll">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Sender</th>
                      <th>Target</th>
                      <th>Pages</th>
                      <th>Status</th>
                      <th v-if="canPrint">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="job in page.jobs" :key="job.id">
                      <td>
                        <span class="lead">{{ job.filename }}</span>
                        <span class="sub">{{ formatPrinterWhen(job.createdAt) }} · {{ SIDE_LABELS[job.sides] || job.sides }}</span>
                        <span v-if="job.error" class="sub" :class="job.status === 'pending' ? 'ph-wait' : 'ph-err'">{{ job.error }}</span>
                      </td>
                      <td>{{ job.sender || job.source }}</td>
                      <td>{{ job.queue }}<span v-if="job.cupsId" class="sub">{{ job.cupsId }}</span></td>
                      <td>{{ job.pages ?? '—' }} × {{ job.copies }}</td>
                      <td><span :class="printerStatusClass(job.status)">{{ JOB_LABELS[job.status] || job.status }}</span></td>
                      <td v-if="canPrint">
                        <button v-if="job.status === 'error'" type="button" class="textlink" @click="retryJob(job.id)">Retry</button>
                        <button v-else-if="job.status === 'pending' && !job.cupsId" type="button" class="textlink" @click="cancelJob(job.id)">Cancel</button>
                        <small v-else-if="job.status === 'submitted'">Already sent</small>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="empty" style="padding: 18px">No print jobs yet.</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="chead"><h3>Current CUPS queue</h3></div>
          <div class="cbody">
            <p v-if="!page.activeJobs.ok" class="help ph-flash ph-flash--err">CUPS queue is unavailable. {{ page.activeJobs.error }}</p>
            <div v-else-if="page.activeJobs.lines.length" class="ph-queue-lines">
              <div v-for="line in page.activeJobs.lines" :key="line">{{ line }}</div>
            </div>
            <p v-else class="empty">No active jobs in CUPS.</p>
          </div>
        </div>
      </template>
      <p v-else-if="!loadError" class="empty">Loading printers…</p>
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
  </section>
</template>

<style scoped>
.printers-page-title { display: inline-flex; align-items: center; gap: 10px; }
.printers-page-logo { width: 22px; height: 22px; color: #64748b; }
.ph-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
.ph-flash { margin: 0 0 12px; }
.ph-flash--err { color: #dc2626; }
.ph-flash--ok { color: #15803d; }
.ph-sub { margin: 4px 0 0; color: #64748b; font-size: 13px; font-weight: 500; }
.ph-split { margin-top: 16px; align-items: start; }
.ph-form { display: flex; flex-direction: column; gap: 12px; }
.ph-form label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #64748b; }
.ph-form input, .ph-form select {
  width: 100%; border: 1px solid #e2e8f0; border-radius: 10px; font: inherit; font-size: 14px;
  padding: 9px 12px; background: #f8fafc; color: #0f172a;
}
.ph-form small { font-weight: 500; color: #94a3b8; }
.ph-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ph-upload {
  display: flex; flex-direction: column; gap: 4px; padding: 18px;
  border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; text-align: center;
}
.ph-dest { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
.ph-dest-choice { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 10px; }
.ph-dest-choice img { width: 40px; height: 40px; object-fit: contain; background: #eef2f7; border-radius: 8px; }
.ph-queue-lines { font-family: "IBM Plex Mono", monospace; font-size: 12.5px; color: #334155; display: grid; gap: 4px; }
.ph-wait { color: #d97706; }
.ph-err { color: #dc2626; }
.ph-empty-art { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
.ph-art-row { display: flex; flex-wrap: wrap; gap: 12px; }
.ph-art-row img {
  width: 140px; height: 105px; object-fit: contain; border-radius: 12px;
  border: 1px solid #cbd5e1; background: #eef2f7;
}
.status-pill {
  display: inline-flex; align-items: center; font-size: 11px; font-weight: 700;
  padding: 3px 8px; border-radius: 999px; background: #f1f5f9; color: #64748b;
}
.status-pill.is-online, .status-pill.is-success { background: #ecfdf5; color: #059669; }
.status-pill.is-offline, .status-pill.is-error { background: #fef2f2; color: #dc2626; }
.status-pill.is-warn, .status-pill.is-rejected { background: #fffbeb; color: #d97706; }
.status-pill.is-wait { background: #eff6ff; color: #2563eb; }
.textlink {
  appearance: none; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; color: #4f46e5;
}
.empty { color: #64748b; }
.staples-page-card .cbody { padding-top: 14px; }
@media (max-width: 900px) {
  .cols { grid-template-columns: 1fr; }
  .ph-row { grid-template-columns: 1fr; }
}
</style>
