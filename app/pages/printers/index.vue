<script setup lang="ts">
import PrinterStation from '~/components/printers/PrinterStation.vue'
import StaffNavIcon from '~/components/staff/StaffNavIcon.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  JOB_LABELS,
  JOB_TONE,
  PRINTER_IMAGE_CATEGORIES,
  SIDE_LABELS,
  type PrinterTab,
} from '#shared/printers'

definePageMeta({ layout: 'staff', permission: 'printers.read.all' })

type PrinterDevice = {
  queue: string
  label: string
  host: string
  protocol: string
  identity: string
  driver: string
  online: boolean
  stats: {
    state?: string
    pages_label?: string
    serial?: string
    firmware?: string
    checks?: Array<{ label: string, value: string, bad: boolean }>
  } | null
  condition: {
    toner: { name: string, percent: number } | null
    drum: { name: string, percent: number } | null
    paper: 'unknown' | 'ready' | 'low' | 'empty'
    jam: 'unknown' | 'clear' | 'jam'
    mark: string
    note: string
  }
  supply: { url?: string, name?: string, note?: string } | null
  image: { url: string, pending?: boolean }
  tail: { online: boolean, hostname: string, ip: string, state: string }
  options: Array<{ key: string, label: string, current: string, paper: boolean, choices: Array<{ value: string, label: string }> }>
  driverInfo: { name: string, package: string, connection: string, ppd: string } | null
}

type PrintersPage = {
  tab: PrinterTab
  printers: PrinterDevice[]
  jobs: Array<{
    id: string
    filename: string
    source: string
    sender: string
    queue: string
    pages: number | null
    copies: number
    sides: string
    status: string
    cupsId: string
    error: string
    createdAt: string
  }>
  events: Array<{ id: string, level: string, message: string, createdAt: string }>
  settings: Record<string, string>
  mail: { state: string, detail: string, checked: string | null }
  tail: { installed: boolean, online: boolean, state: string, detail: string }
  cups: { ok: boolean, lines: string[], error: string }
  activeJobs: { ok: boolean, lines: string[], error: string }
  counts: { total: number, errors: number, submitted: number, pending: number, printers: number }
}

const TAB_ITEMS: Array<{ id: PrinterTab, label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'devices', label: 'Printers' },
  { id: 'jobs', label: 'Print jobs' },
  { id: 'email', label: 'Email automation' },
  { id: 'tailscale', label: 'Tailscale' },
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canPrint = computed(() => auth.can('printers.print.all'))
const canManage = computed(() => auth.can('printers.manage.all'))

const tab = computed<PrinterTab>(() => {
  const raw = String(route.query.tab || 'overview')
  return (TAB_ITEMS.some(item => item.id === raw) ? raw : 'overview') as PrinterTab
})

const page = ref<PrintersPage | null>(null)
const loadError = ref('')
const flashOk = ref('')
const flashErr = ref('')
const busy = ref('')
const editingQueue = ref('')
const optionDrafts = reactive<Record<string, Record<string, string>>>({})

const addForm = reactive({ label: '', queue: '', host: '', authKey: '', tailHostname: '' })
const editForm = reactive({ label: '', host: '' })
const printForm = reactive({ queue: '', sides: 'one-sided', copies: 1, file: null as File | null })
const mailForm = reactive({
  mail_enabled: false,
  imap_host: 'imap.gmail.com',
  imap_port: 993,
  imap_user: '',
  imap_password: '',
  imap_folder: 'INBOX',
  default_queue: '',
  default_sides: 'one-sided',
  max_pages: 40,
  max_mb: 12,
  max_files: 5,
  poll_seconds: 3,
  print_email_body: false,
  allowed_senders: '',
  mail_recipient: '',
  new_pin: '',
  reply_enabled: false,
  smtp_from: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
})
const folders = ref<string[]>(['INBOX'])
const tailForms = reactive<Record<string, { auth_key: string, hostname: string }>>({})

function applySettings(settings: Record<string, string>) {
  mailForm.mail_enabled = settings.mail_enabled === '1'
  mailForm.imap_host = settings.imap_host || 'imap.gmail.com'
  mailForm.imap_port = Number(settings.imap_port || 993)
  mailForm.imap_user = settings.imap_user || ''
  mailForm.imap_folder = settings.imap_folder || 'INBOX'
  mailForm.default_queue = settings.default_queue || ''
  mailForm.default_sides = settings.default_sides || 'one-sided'
  mailForm.max_pages = Number(settings.max_pages || 40)
  mailForm.max_mb = Number(settings.max_mb || 12)
  mailForm.max_files = Number(settings.max_files || 5)
  mailForm.poll_seconds = Number(settings.poll_seconds || 3)
  mailForm.print_email_body = settings.print_email_body === '1'
  mailForm.allowed_senders = settings.allowed_senders || ''
  mailForm.mail_recipient = settings.mail_recipient || ''
  mailForm.reply_enabled = settings.reply_enabled === '1'
  mailForm.smtp_from = settings.smtp_from || ''
  mailForm.smtp_host = settings.smtp_host || 'smtp.gmail.com'
  mailForm.smtp_port = Number(settings.smtp_port || 587)
  folders.value = [mailForm.imap_folder, ...folders.value.filter(name => name !== mailForm.imap_folder)]
}

async function load() {
  loadError.value = ''
  try {
    const data = await $fetch<PrintersPage>('/api/printers', { query: { tab: tab.value } })
    page.value = data
    applySettings(data.settings)
    if (!printForm.queue && data.printers[0]) printForm.queue = data.printers[0].queue
    for (const printer of data.printers) {
      if (!optionDrafts[printer.queue]) {
        optionDrafts[printer.queue] = Object.fromEntries(printer.options.map(opt => [opt.key, opt.current]))
      }
      if (!tailForms[printer.queue]) {
        tailForms[printer.queue] = { auth_key: '', hostname: printer.tail.hostname }
      }
    }
  }
  catch (e: unknown) {
    loadError.value = syncFetchErrorMessage(e, 'Could not load printers')
  }
}

function goTab(id: PrinterTab) {
  router.replace({ query: { ...route.query, tab: id === 'overview' ? undefined : id, edit: undefined } })
}

function startEdit(printer: PrinterDevice) {
  editingQueue.value = printer.queue
  editForm.label = printer.label
  editForm.host = printer.host
  goTab('devices')
}

function statusClass(status: string) {
  const tone = JOB_TONE[status] || 'neutral'
  return `status-pill is-${tone}`
}

function liveLabel(printer: PrinterDevice) {
  if (printer.online && printer.stats?.state) return printer.stats.state
  return printer.online ? 'Online' : 'Offline'
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

async function addPrinter() {
  await withBusy('add', async () => {
    const res = await $fetch<{ identity: string }>('/api/printers/devices', { method: 'POST', body: { ...addForm } })
    addForm.label = ''
    addForm.queue = ''
    addForm.host = ''
    addForm.authKey = ''
    addForm.tailHostname = ''
    return `Printer configured (${res.identity})`
  })
}

async function saveEdit(reread = false) {
  const queue = editingQueue.value
  await withBusy(`edit-${queue}`, async () => {
    await $fetch(`/api/printers/devices/${encodeURIComponent(queue)}`, {
      method: 'PATCH',
      body: { ...editForm, reread },
    })
    editingQueue.value = ''
    return reread ? 'Printer re-read' : 'Printer saved'
  })
}

async function removePrinter(queue: string, label: string) {
  if (!confirm(`Delete printer ${label}?`)) return
  await withBusy(`rm-${queue}`, async () => {
    await $fetch(`/api/printers/devices/${encodeURIComponent(queue)}`, { method: 'DELETE' })
    return `${label} removed`
  })
}

async function saveOptions(queue: string) {
  await withBusy(`opt-${queue}`, async () => {
    await $fetch(`/api/printers/devices/${encodeURIComponent(queue)}/options`, {
      method: 'POST',
      body: { options: optionDrafts[queue] || {} },
    })
    return 'Driver settings saved'
  })
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

function draftsFor(queue: string) {
  if (!optionDrafts[queue]) optionDrafts[queue] = {}
  return optionDrafts[queue]!
}

function tailForm(queue: string) {
  if (!tailForms[queue]) tailForms[queue] = { auth_key: '', hostname: '' }
  return tailForms[queue]!
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

async function saveMail(loadFolders = false) {
  await withBusy('mail', async () => {
    const payload: Record<string, unknown> = { ...mailForm, load_folders: loadFolders }
    if (loadFolders) delete payload.new_pin
    const res = await $fetch<{ settings: Record<string, string>, folders?: string[] }>('/api/printers/settings', {
      method: 'PATCH',
      body: payload,
    })
    if (res.folders?.length) folders.value = res.folders
    applySettings(res.settings)
    return loadFolders ? 'Folders loaded' : 'Email automation saved'
  })
}

async function tailscale(queue: string, action: 'join' | 'leave') {
  const form = tailForms[queue] || { auth_key: '', hostname: '' }
  if (action === 'leave' && !confirm('Remove this printer from the tailnet?')) return
  await withBusy(`tail-${queue}`, async () => {
    await $fetch(`/api/printers/devices/${encodeURIComponent(queue)}/tailscale`, {
      method: 'POST',
      body: { action, auth_key: form.auth_key, hostname: form.hostname },
    })
    form.auth_key = ''
    return action === 'join' ? 'Joined the tailnet' : 'Removed from the tailnet'
  })
}

async function saveImage(queue: string, action: string, extra?: { illustration?: string, file?: File }) {
  const data = new FormData()
  data.append('action', action)
  if (extra?.illustration) data.append('illustration', extra.illustration)
  if (extra?.file) data.append('upload', extra.file)
  await withBusy(`img-${queue}`, async () => {
    await $fetch(`/api/printers/${encodeURIComponent(queue)}/image`, { method: 'POST', body: data })
    return 'Printer image updated'
  })
}

watch(tab, () => { void load() }, { immediate: true })

let pollTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  pollTimer = setInterval(() => {
    if (tab.value === 'overview' || tab.value === 'jobs') void load()
  }, 8000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const mailTone = computed(() => {
  const state = page.value?.mail.state || ''
  if (state === 'Healthy' || state === 'Watching') return 'good'
  if (state === 'Error') return 'bad'
  return 'warn'
})
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Shop printers, CUPS queues, email-to-print, and Tailscale">
      <template #title>
        <span class="printers-page-title">
          <StaffNavIcon name="printers" class="printers-page-logo" />
          Printers
        </span>
      </template>
    </StaffPageHead>

    <nav class="ph-tabs" aria-label="Printers sections">
      <button
        v-for="item in TAB_ITEMS"
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

    <template v-if="page">
      <template v-if="tab === 'overview'">
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
                {{ liveLabel(printer) }}
              </span>
            </div>
            <div class="cbody">
              <PrinterStation
                :queue="printer.queue"
                :label="printer.label"
                :image-url="printer.image.url"
                :condition="printer.condition"
                :supply-url="printer.supply?.url"
                :checks="printer.stats?.checks"
              />
            </div>
          </article>
        </div>
        <div v-else class="card"><div class="cbody empty">No printer yet. Add one on the Printers tab and its readings will show here.</div></div>

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
              <h3>Recent jobs</h3>
              <button type="button" class="chip" @click="goTab('jobs')">All jobs</button>
            </div>
            <div class="cbody" style="padding: 0">
              <div v-if="page.jobs.length" class="tscroll">
                <table class="tbl">
                  <thead><tr><th>Document</th><th>Printer</th><th>Status</th></tr></thead>
                  <tbody>
                    <tr v-for="job in page.jobs.slice(0, 7)" :key="job.id">
                      <td>
                        <span class="lead">{{ job.filename }}</span>
                        <span class="sub">{{ formatWhen(job.createdAt) }}</span>
                      </td>
                      <td>{{ job.queue }}</td>
                      <td><span :class="statusClass(job.status)">{{ JOB_LABELS[job.status] || job.status }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="empty" style="padding: 18px">No print jobs yet.</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="chead"><h3>Event log</h3></div>
          <div class="cbody" style="padding: 0">
            <div v-if="page.events.length" class="tscroll">
              <table class="tbl">
                <thead><tr><th>When</th><th>Level</th><th>Message</th></tr></thead>
                <tbody>
                  <tr v-for="eventRow in page.events" :key="eventRow.id">
                    <td>{{ formatWhen(eventRow.createdAt) }}</td>
                    <td><span :class="statusClass(eventRow.level === 'success' ? 'submitted' : eventRow.level === 'error' ? 'error' : eventRow.level === 'warning' ? 'rejected' : 'pending')">{{ eventRow.level }}</span></td>
                    <td>{{ eventRow.message }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="empty" style="padding: 18px">No events recorded yet.</p>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'devices'">
        <div class="cols ph-split">
          <div class="stack">
            <div class="card">
              <div class="chead"><div><h3>Connected destinations</h3><p class="ph-sub">Drum, toner, paper, and jams, read when this page opens.</p></div></div>
              <div v-if="page.printers.length" class="cbody ph-device-list">
                <article v-for="printer in page.printers" :key="printer.queue" class="ph-device">
                  <div class="ph-device-line">
                    <img class="ph-thumb" :src="printer.image.url" alt="" width="44" height="44">
                    <div class="grow">
                      <strong>{{ printer.label }}</strong>
                      <small>{{ printer.identity || 'Printer' }} · {{ printer.host }}</small>
                    </div>
                    <span class="status-pill" :class="printer.online ? 'is-online' : 'is-offline'">{{ printer.online ? 'Reachable' : 'Offline' }}</span>
                    <div v-if="canManage" class="ph-acts">
                      <button type="button" class="textlink" @click="startEdit(printer)">Edit</button>
                      <button type="button" class="text-danger" :disabled="busy === `rm-${printer.queue}`" @click="removePrinter(printer.queue, printer.label)">Remove</button>
                    </div>
                  </div>
                  <PrinterStation
                    :queue="printer.queue"
                    :label="printer.label"
                    :image-url="printer.image.url"
                    :condition="printer.condition"
                    :supply-url="printer.supply?.url"
                    :checks="printer.stats?.checks"
                  />
                  <p v-if="printer.stats?.pages_label || printer.stats?.serial || printer.stats?.firmware" class="ph-facts">
                    <span v-if="printer.stats.pages_label">Pages <strong>{{ printer.stats.pages_label }}</strong></span>
                    <span v-if="printer.stats.serial">Serial <strong>{{ printer.stats.serial }}</strong></span>
                    <span v-if="printer.stats.firmware">Firmware <strong>{{ printer.stats.firmware }}</strong></span>
                  </p>
                  <div v-if="printer.driverInfo" class="ph-driver">
                    <h4>Driver settings</h4>
                    <p>Driver <strong>{{ printer.driverInfo.name }}</strong>
                      <template v-if="printer.driverInfo.package"> · {{ printer.driverInfo.package }}</template>
                      <template v-if="printer.driverInfo.connection"> · {{ printer.driverInfo.connection }}</template>
                    </p>
                    <form v-if="canManage && printer.options.length" class="ph-form" @submit.prevent="saveOptions(printer.queue)">
                      <div class="ph-options">
                        <label v-for="opt in printer.options" :key="opt.key" :class="{ 'span-2': opt.paper }">
                          {{ opt.label }}
                          <select v-model="draftsFor(printer.queue)[opt.key]">
                            <option v-for="choice in opt.choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
                          </select>
                        </label>
                      </div>
                      <button class="btn" type="submit" :disabled="busy === `opt-${printer.queue}`">Save settings</button>
                    </form>
                  </div>
                  <details v-if="canManage" class="ph-details">
                    <summary>Change printer image</summary>
                    <div class="ph-form">
                      <label>Illustration
                        <select @change="saveImage(printer.queue, 'apply', { illustration: ($event.target as HTMLSelectElement).value })">
                          <option value="">Keep the current picture</option>
                          <option v-for="cat in PRINTER_IMAGE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                        </select>
                      </label>
                      <label>Upload a PNG, JPEG, WebP, or SVG
                        <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" @change="saveImage(printer.queue, 'apply', { file: ($event.target as HTMLInputElement).files?.[0] })">
                      </label>
                      <button type="button" class="btn" @click="saveImage(printer.queue, 'auto')">Restore automatic</button>
                    </div>
                  </details>
                </article>
              </div>
              <div v-else class="cbody empty">No printer added yet.</div>
            </div>
            <div class="card">
              <div class="chead"><h3>CUPS queues</h3></div>
              <div class="cbody">
                <p v-if="!page.cups.ok" class="help ph-flash ph-flash--err">CUPS is not available. {{ page.cups.error }}</p>
                <div v-else-if="page.cups.lines.length" class="ph-queue-lines">
                  <div v-for="line in page.cups.lines" :key="line">{{ line }}</div>
                </div>
                <p v-else class="empty">CUPS reported no queues.</p>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="chead">
              <div>
                <h3>{{ editingQueue ? `Edit ${editForm.label}` : 'Add a printer' }}</h3>
                <p class="ph-sub">{{ editingQueue ? 'Change the name or address. The queue name stays the same.' : 'Use the printer address reachable from this host.' }}</p>
              </div>
            </div>
            <div class="cbody">
              <form v-if="canManage && editingQueue" class="ph-form" @submit.prevent="saveEdit(false)">
                <label>Display name<input v-model="editForm.label" required maxlength="100"></label>
                <p class="ph-help">Queue name: {{ editingQueue }}</p>
                <label>Printer IPv4<input v-model="editForm.host" required inputmode="decimal" autocomplete="off"></label>
                <div class="actions">
                  <button class="btn primary" type="submit">Save printer</button>
                  <button class="btn" type="button" @click="saveEdit(true)">Read printer again</button>
                  <button class="btn" type="button" @click="editingQueue = ''">Cancel</button>
                </div>
              </form>
              <form v-else-if="canManage" class="ph-form" @submit.prevent="addPrinter">
                <label>Display name<input v-model="addForm.label" required maxlength="100" placeholder="Brother HL-L2380DW"></label>
                <label>Queue name<input v-model="addForm.queue" required maxlength="41" placeholder="Office" autocapitalize="off" spellcheck="false"></label>
                <label>Printer IPv4<input v-model="addForm.host" required placeholder="192.168.50.40" inputmode="decimal" autocomplete="off"></label>
                <p class="ph-help">DORINC reads the make and model, then picks a matching CUPS driver.</p>
                <label>Tailscale auth key
                  <input v-model="addForm.authKey" type="password" autocomplete="off" placeholder="tskey-auth-...">
                  <small>Optional. Joins this printer as its own tailnet device. The key is used once and is not saved.</small>
                </label>
                <label>Device hostname
                  <input v-model="addForm.tailHostname" maxlength="63" placeholder="office-brother" autocapitalize="off">
                </label>
                <button class="btn primary" type="submit" :disabled="busy === 'add'">
                  {{ busy === 'add' ? 'Creating…' : 'Create printer queue' }}
                </button>
              </form>
              <p v-else class="empty">You need Manage printers permission to add destinations.</p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'jobs'">
        <div class="card">
          <div class="chead">
            <div>
              <h3>Job log</h3>
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
                      <span class="sub">{{ formatWhen(job.createdAt) }} · {{ SIDE_LABELS[job.sides] || job.sides }}</span>
                      <span v-if="job.error" class="sub" :class="job.status === 'pending' ? 'ph-wait' : 'ph-err'">{{ job.error }}</span>
                    </td>
                    <td>{{ job.sender || job.source }}</td>
                    <td>{{ job.queue }}<span v-if="job.cupsId" class="sub">{{ job.cupsId }}</span></td>
                    <td>{{ job.pages ?? '—' }} × {{ job.copies }}</td>
                    <td><span :class="statusClass(job.status)">{{ JOB_LABELS[job.status] || job.status }}</span></td>
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

      <template v-else-if="tab === 'email'">
        <div class="ph-mailhead">
          <div>
            <h3>Email automation</h3>
            <p class="ph-sub">New mail in one folder prints to one printer.</p>
          </div>
          <div class="ph-health" :class="`is-${mailTone}`">
            <span class="ph-dot" />
            <div>
              <strong>{{ page.mail.state }}</strong>
              <small>{{ page.mail.detail || page.mail.checked || 'Not checked yet' }}</small>
            </div>
          </div>
        </div>
        <form v-if="canManage" class="card ph-setup" @submit.prevent="saveMail(false)">
          <ol class="ph-steps">
            <li>
              <h4>Turn it on</h4>
              <label class="ph-toggle">
                <input v-model="mailForm.mail_enabled" type="checkbox">
                <span><strong>Enable email printing</strong><small>Only new mail is printed.</small></span>
              </label>
            </li>
            <li>
              <h4>Connect the mailbox</h4>
              <div class="ph-row">
                <label>Mailbox email<input v-model="mailForm.imap_user" type="email" placeholder="printer@gmail.com" autocomplete="off"></label>
                <label>App password<input v-model="mailForm.imap_password" type="password" autocomplete="new-password" :placeholder="page.settings.imap_password === 'saved' ? 'Saved. Leave blank to keep' : 'App password'"></label>
              </div>
              <div class="ph-row">
                <label>IMAP server<input v-model="mailForm.imap_host" required></label>
                <label>Port<input v-model.number="mailForm.imap_port" type="number" min="1" max="65535"></label>
              </div>
              <div class="ph-row">
                <label>Folder
                  <select v-model="mailForm.imap_folder">
                    <option v-for="folder in folders" :key="folder" :value="folder">{{ folder }}</option>
                  </select>
                </label>
                <button class="btn" type="button" @click="saveMail(true)">Load folders</button>
              </div>
            </li>
            <li>
              <h4>Choose the printer</h4>
              <div class="ph-row">
                <label>Printer
                  <select v-model="mailForm.default_queue">
                    <option value="">Select printer</option>
                    <option v-for="printer in page.printers" :key="printer.queue" :value="printer.queue">{{ printer.label }}</option>
                  </select>
                </label>
                <label>Sides
                  <select v-model="mailForm.default_sides">
                    <option value="one-sided">Single-sided</option>
                    <option value="two-sided-long-edge">Long-edge duplex</option>
                    <option value="two-sided-short-edge">Short-edge duplex</option>
                  </select>
                </label>
              </div>
              <div class="ph-row ph-row-4">
                <label>Max pages<input v-model.number="mailForm.max_pages" type="number" min="1" max="200"></label>
                <label>Max file size (MB)<input v-model.number="mailForm.max_mb" type="number" min="1" max="30"></label>
                <label>Attachments<input v-model.number="mailForm.max_files" type="number" min="1" max="10"></label>
                <label>Check every (seconds)<input v-model.number="mailForm.poll_seconds" type="number" min="2" max="3600"></label>
              </div>
              <label class="ph-toggle">
                <input v-model="mailForm.print_email_body" type="checkbox">
                <span><strong>Print the message text</strong><small>Only when there is no attachment.</small></span>
              </label>
            </li>
            <li>
              <h4>Limit who can print</h4>
              <label>Allowed senders<input v-model="mailForm.allowed_senders" placeholder="name@example.com"><small>Blank accepts any sender.</small></label>
              <label>Must be sent to<input v-model="mailForm.mail_recipient" type="email"><small>Blank accepts any To or Cc.</small></label>
              <label>Subject PIN<input v-model="mailForm.new_pin" maxlength="32" autocomplete="off" placeholder="6 to 32 letters or digits"><small>{{ page.settings.email_pin ? 'A PIN is on. Leave this blank and save to remove it.' : 'Blank means no PIN.' }}</small></label>
            </li>
            <li>
              <h4>Reply to the sender</h4>
              <label class="ph-toggle">
                <input v-model="mailForm.reply_enabled" type="checkbox">
                <span><strong>Send a result email</strong></span>
              </label>
              <label>From address<input v-model="mailForm.smtp_from" type="email" placeholder="Same as the mailbox"></label>
              <div class="ph-row">
                <label>SMTP server<input v-model="mailForm.smtp_host"></label>
                <label>SMTP port<input v-model.number="mailForm.smtp_port" type="number" min="1" max="65535"></label>
              </div>
            </li>
          </ol>
          <div class="cbody">
            <h4>Subject</h4>
            <p class="ph-sub">Use one of these. Extra words such as DUPLEX override the sides above.</p>
            <div class="ph-pills">
              <code>PRINT{{ page.settings.email_pin && page.settings.email_pin !== 'saved' ? ` PIN:${page.settings.email_pin}` : '' }}</code>
              <code>PRINT DUPLEX</code>
              <code>PRINT SHORT EDGE</code>
              <code>PRINT DUPLEX COPIES=3</code>
            </div>
            <button class="btn primary" type="submit" :disabled="busy === 'mail'">{{ busy === 'mail' ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
        <p v-else class="card"><span class="cbody empty" style="display:block">You need Manage printers permission to change email automation.</span></p>
      </template>

      <template v-else-if="tab === 'tailscale'">
        <div v-if="!page.tail.installed" class="card">
          <div class="chead"><h3>Tailscale is not installed</h3></div>
          <div class="cbody"><p>{{ page.tail.detail }}</p></div>
        </div>
        <div v-else-if="page.printers.length" class="card">
          <div class="chead">
            <div>
              <h3>Printer devices</h3>
              <p class="ph-sub">{{ page.tail.detail }} An auth key is used once and is not saved.</p>
            </div>
            <span v-if="page.tail.online" class="status-pill is-online">{{ page.tail.state }}</span>
          </div>
          <div class="cbody stack">
            <article v-for="printer in page.printers" :key="printer.queue" class="ph-device">
              <div class="ph-device-line">
                <div class="grow">
                  <strong>{{ printer.label }}</strong>
                  <small>{{ printer.host }}</small>
                </div>
                <span class="status-pill" :class="printer.tail.online ? 'is-online' : 'is-offline'">{{ printer.tail.state }}</span>
              </div>
              <p class="ph-help">
                <template v-if="printer.tail.online">{{ printer.tail.hostname || printer.label }}<template v-if="printer.tail.ip"> · {{ printer.tail.ip }}</template></template>
                <template v-else-if="printer.tail.hostname">{{ printer.tail.hostname }} is signed out.</template>
                <template v-else>{{ printer.label }} is not set up on Tailscale.</template>
              </p>
              <form v-if="canManage" class="ph-form" @submit.prevent="tailscale(printer.queue, 'join')">
                <label>Auth key<input v-model="tailForm(printer.queue).auth_key" type="password" required autocomplete="off" placeholder="tskey-auth-..."></label>
                <label>Device hostname<input v-model="tailForm(printer.queue).hostname" maxlength="63" placeholder="office-brother"></label>
                <div class="actions">
                  <button class="btn primary" type="submit">Join as its own device</button>
                  <button v-if="printer.tail.hostname || printer.tail.online" class="btn" type="button" @click="tailscale(printer.queue, 'leave')">Remove this device</button>
                </div>
              </form>
            </article>
          </div>
        </div>
        <div v-else class="card"><div class="cbody empty">Add a printer, then join it here as its own device.</div></div>
        <div class="card">
          <div class="chead"><h3>Before you print</h3></div>
          <div class="cbody ph-checks">
            <div><b>01</b><strong>Advertise the printer</strong><p>An always-on device on the printer LAN should advertise that address, preferably as a /32.</p></div>
            <div><b>02</b><strong>Approve the route</strong><p>Approve it for this printer's device in the Tailscale admin console.</p></div>
            <div><b>03</b><strong>Use the LAN address</strong><p>Add the printer with that LAN address. Print jobs and toner readings use this printer's device.</p></div>
          </div>
        </div>
      </template>
    </template>
    <p v-else-if="!loadError" class="empty">Loading printers…</p>
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
.ph-form label, .ph-setup label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #64748b; }
.ph-form input, .ph-form select, .ph-setup input, .ph-setup select {
  width: 100%; border: 1px solid #e2e8f0; border-radius: 10px; font: inherit; font-size: 14px;
  padding: 9px 12px; background: #f8fafc; color: #0f172a;
}
.ph-form small, .ph-setup small { font-weight: 500; color: #94a3b8; }
.ph-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ph-row-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ph-help { margin: 0; font-size: 13px; color: #64748b; }
.ph-upload {
  display: flex; flex-direction: column; gap: 4px; padding: 18px;
  border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; text-align: center;
}
.ph-dest { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
.ph-dest-choice { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 10px; }
.ph-dest-choice img { width: 40px; height: 40px; object-fit: contain; background: #fff; border-radius: 8px; }
.ph-device { display: flex; flex-direction: column; gap: 14px; padding-bottom: 18px; border-bottom: 1px solid #f1f5f9; }
.ph-device:last-child { border-bottom: 0; padding-bottom: 0; }
.ph-device-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ph-thumb { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; }
.grow { flex: 1; min-width: 0; }
.grow small { display: block; color: #64748b; font-size: 12px; }
.ph-acts { display: flex; gap: 8px; }
.ph-facts { display: flex; flex-wrap: wrap; gap: 14px; margin: 0; color: #64748b; font-size: 13px; }
.ph-driver h4 { margin: 0 0 6px; font-size: 13px; }
.ph-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.span-2 { grid-column: span 2; }
.ph-details { border-top: 1px solid #f1f5f9; padding-top: 10px; }
.ph-queue-lines { font-family: "IBM Plex Mono", monospace; font-size: 12.5px; color: #334155; display: grid; gap: 4px; }
.ph-wait { color: #d97706; }
.ph-err { color: #dc2626; }
.ph-mailhead { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; }
.ph-health { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
.ph-health small { display: block; color: #64748b; }
.ph-dot { width: 10px; height: 10px; border-radius: 50%; background: #d97706; }
.ph-health.is-good .ph-dot { background: #059669; }
.ph-health.is-bad .ph-dot { background: #dc2626; }
.ph-steps { margin: 0; padding: 18px 18px 0 36px; display: grid; gap: 22px; }
.ph-steps h4 { margin: 0 0 10px; }
.ph-toggle { flex-direction: row !important; align-items: flex-start; gap: 10px !important; }
.ph-toggle input { width: auto; margin-top: 3px; }
.ph-pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 16px; }
.ph-pills code { background: #f1f5f9; padding: 6px 10px; border-radius: 8px; font-size: 12px; }
.ph-checks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.ph-checks b { display: block; color: #4f46e5; font-size: 12px; }
.ph-checks p { margin: 6px 0 0; color: #64748b; font-size: 13px; }
.status-pill {
  display: inline-flex; align-items: center; font-size: 11px; font-weight: 700;
  padding: 3px 8px; border-radius: 999px; background: #f1f5f9; color: #64748b;
}
.status-pill.is-online, .status-pill.is-success { background: #ecfdf5; color: #059669; }
.status-pill.is-offline, .status-pill.is-error { background: #fef2f2; color: #dc2626; }
.status-pill.is-warn, .status-pill.is-rejected { background: #fffbeb; color: #d97706; }
.status-pill.is-wait { background: #eff6ff; color: #2563eb; }
.textlink, .text-danger {
  appearance: none; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0;
}
.textlink { color: #4f46e5; }
.text-danger { color: #dc2626; }
.empty { color: #64748b; }
@media (max-width: 900px) {
  .cols { grid-template-columns: 1fr; }
  .ph-row, .ph-row-4, .ph-options, .ph-checks { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
}
</style>
