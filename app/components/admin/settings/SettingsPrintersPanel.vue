<script setup lang="ts">
import PrinterStation from '~/components/printers/PrinterStation.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  formatPrinterWhen,
  printerLiveLabel,
  printerLiveTone,
  printersBusy,
  type PrinterDevice,
  type PrintersPage,
} from '~/utils/printers-ui'
import { IMAGE_CATEGORY_LABELS, PRINTER_IMAGE_CATEGORIES } from '#shared/printers'

const props = defineProps<{ active?: boolean }>()
const emit = defineEmits<{ saved: [] }>()

const auth = useAuthStore()
const canManage = computed(() => auth.can('printers.manage.all'))

type PanelTab = 'printers' | 'email'
const TABS: Array<{ id: PanelTab, label: string }> = [
  { id: 'printers', label: 'Printers' },
  { id: 'email', label: 'Email to print' },
]
const MAIN_OPTIONS = 4

const tab = ref<PanelTab>('printers')
const page = ref<PrintersPage | null>(null)
const loadError = ref('')
const flashOk = ref('')
const flashErr = ref('')
const busy = ref('')
const editingQueue = ref('')
const openPanel = reactive<Record<string, '' | 'driver' | 'tailscale' | 'picture'>>({})
const allOptions = reactive<Record<string, boolean>>({})
const optionDrafts = reactive<Record<string, Record<string, string>>>({})
const tailKeys = reactive<Record<string, string>>({})
const previewAt = reactive<Record<string, number>>({})
const addForm = reactive({ label: '', host: '', authKey: '' })
const addedQueue = ref('')
const editForm = reactive({ label: '', host: '' })
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
  email_pin: '',
  reply_enabled: false,
  smtp_from: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
})
const mailLoaded = ref(false)
const folders = ref<string[]>(['INBOX'])

const mailTone = computed(() => {
  const state = page.value?.mail.state || ''
  if (state === 'Healthy' || state === 'Watching') return 'good'
  if (state === 'Error') return 'bad'
  return 'warn'
})
const passwordSaved = computed(() => page.value?.settings.imap_password_saved === true)
const subjectPin = computed(() => (mailForm.email_pin ? ` PIN:${mailForm.email_pin}` : ''))

function setting(settings: Record<string, string | boolean>, key: string, fallback = '') {
  const value = settings[key]
  return typeof value === 'string' ? value : fallback
}

/** Fill the mailbox form once, so a background refresh never erases what is being typed. */
function applySettings(settings: Record<string, string | boolean>) {
  mailForm.mail_enabled = setting(settings, 'mail_enabled') === '1'
  mailForm.imap_host = setting(settings, 'imap_host', 'imap.gmail.com')
  mailForm.imap_port = Number(setting(settings, 'imap_port', '993'))
  mailForm.imap_user = setting(settings, 'imap_user')
  mailForm.imap_password = ''
  mailForm.imap_folder = setting(settings, 'imap_folder', 'INBOX')
  mailForm.default_queue = setting(settings, 'default_queue')
  mailForm.default_sides = setting(settings, 'default_sides', 'one-sided')
  mailForm.max_pages = Number(setting(settings, 'max_pages', '40'))
  mailForm.max_mb = Number(setting(settings, 'max_mb', '12'))
  mailForm.max_files = Number(setting(settings, 'max_files', '5'))
  mailForm.poll_seconds = Number(setting(settings, 'poll_seconds', '3'))
  mailForm.print_email_body = setting(settings, 'print_email_body') === '1'
  mailForm.allowed_senders = setting(settings, 'allowed_senders')
  mailForm.mail_recipient = setting(settings, 'mail_recipient')
  mailForm.email_pin = setting(settings, 'email_pin')
  mailForm.reply_enabled = setting(settings, 'reply_enabled') === '1'
  mailForm.smtp_from = setting(settings, 'smtp_from')
  mailForm.smtp_host = setting(settings, 'smtp_host', 'smtp.gmail.com')
  mailForm.smtp_port = Number(setting(settings, 'smtp_port', '587'))
  folders.value = [mailForm.imap_folder, ...folders.value.filter(name => name !== mailForm.imap_folder)]
  mailLoaded.value = true
}

async function load(quiet = false) {
  if (!quiet) loadError.value = ''
  try {
    const data = await $fetch<PrintersPage>('/api/printers', { query: { tab: tab.value === 'email' ? 'email' : 'printers' } })
    page.value = data
    loadError.value = ''
    if (!mailLoaded.value && data.engine.ok) applySettings(data.settings)
    for (const printer of data.printers) {
      if (!optionDrafts[printer.queue] && printer.options?.length) {
        optionDrafts[printer.queue] = Object.fromEntries(printer.options.map(opt => [opt.key, opt.current]))
      }
    }
    // The add form keeps what was typed until that printer is really saved.
    if (addedQueue.value && data.printers.some(printer => printer.queue === addedQueue.value)) {
      addForm.label = ''
      addForm.host = ''
      addForm.authKey = ''
      addedQueue.value = ''
    }
  }
  catch (e: unknown) {
    if (!quiet) loadError.value = syncFetchErrorMessage(e, 'Could not load printer settings')
  }
}

async function withBusy(key: string, fn: () => Promise<string | undefined>) {
  busy.value = key
  flashOk.value = ''
  flashErr.value = ''
  try {
    const notice = await fn()
    if (notice) flashOk.value = notice
    await load()
    emit('saved')
  }
  catch (e: unknown) {
    flashErr.value = syncFetchErrorMessage(e, 'That did not work. Try again.')
  }
  finally {
    busy.value = ''
  }
}

function device(queue: string) {
  return `/api/printers/devices/${encodeURIComponent(queue)}`
}

function togglePanel(queue: string, name: 'driver' | 'tailscale' | 'picture') {
  openPanel[queue] = openPanel[queue] === name ? '' : name
}

async function addPrinter() {
  await withBusy('add', async () => {
    const res = await $fetch<{ queue: string, label: string }>('/api/printers/devices', { method: 'POST', body: { ...addForm } })
    addedQueue.value = res.queue
    return undefined
  })
}

async function dismissSetup(queue: string) {
  await withBusy(`dismiss-${queue}`, async () => {
    await $fetch(`/api/printers/setups/${encodeURIComponent(queue)}`, { method: 'DELETE' })
    if (addedQueue.value === queue) addedQueue.value = ''
    return undefined
  })
}

function startEdit(printer: PrinterDevice) {
  editingQueue.value = printer.queue
  editForm.label = printer.label
  editForm.host = printer.host
}

async function saveEdit() {
  const queue = editingQueue.value
  await withBusy(`edit-${queue}`, async () => {
    const res = await $fetch<{ pending: boolean }>(device(queue), { method: 'PATCH', body: { ...editForm } })
    editingQueue.value = ''
    return res.pending ? undefined : 'Printer saved'
  })
}

async function readAgain(queue: string) {
  await withBusy(`setup-${queue}`, async () => {
    await $fetch(`${device(queue)}/setup`, { method: 'POST' })
    return undefined
  })
}

async function removePrinter(printer: PrinterDevice) {
  const tailnet = printer.tail.hostname ? ' Its Tailscale device is signed out too.' : ''
  if (!confirm(`Remove ${printer.label}?${tailnet}`)) return
  await withBusy(`rm-${printer.queue}`, async () => {
    await $fetch(device(printer.queue), { method: 'DELETE' })
    return `${printer.label} removed`
  })
}

function draftsFor(queue: string) {
  if (!optionDrafts[queue]) optionDrafts[queue] = {}
  return optionDrafts[queue]!
}

function shownOptions(printer: PrinterDevice) {
  const options = printer.options || []
  return allOptions[printer.queue] ? options : options.slice(0, MAIN_OPTIONS)
}

async function saveOptions(queue: string) {
  await withBusy(`opt-${queue}`, async () => {
    await $fetch(`${device(queue)}/options`, { method: 'POST', body: { options: optionDrafts[queue] || {} } })
    return 'Driver settings saved'
  })
}

async function tailscale(printer: PrinterDevice, action: 'join' | 'leave') {
  if (action === 'leave' && !confirm(`Remove ${printer.label} from the tailnet?`)) return
  await withBusy(`tail-${printer.queue}`, async () => {
    await $fetch(`${device(printer.queue)}/tailscale`, {
      method: 'POST',
      body: { action, auth_key: tailKeys[printer.queue] || '' },
    })
    tailKeys[printer.queue] = ''
    return action === 'leave' ? `${printer.label} removed from the tailnet` : undefined
  })
}

async function saveImage(queue: string, action: string, extra: { choice?: string, illustration?: string, file?: File | null } = {}) {
  if (action === 'preview' && !extra.file) return
  const data = new FormData()
  data.append('action', action)
  if (extra.choice) data.append('choice', extra.choice)
  if (extra.illustration) data.append('illustration', extra.illustration)
  if (extra.file) data.append('upload', extra.file)
  await withBusy(`img-${queue}`, async () => {
    const res = await $fetch<{ notice?: string, preview?: boolean }>(`/api/printers/${encodeURIComponent(queue)}/image`, { method: 'POST', body: data })
    if (res.preview) previewAt[queue] = Date.now()
    else previewAt[queue] = 0
    return res.notice
  })
}

async function saveMail(loadFolders = false) {
  await withBusy(loadFolders ? 'folders' : 'mail', async () => {
    const res = await $fetch<{ settings?: Record<string, string | boolean>, folders?: string[] }>('/api/printers/settings', {
      method: 'PATCH',
      body: { ...mailForm, load_folders: loadFolders },
    })
    if (res.folders?.length) {
      folders.value = [mailForm.imap_folder, ...res.folders.filter(name => name !== mailForm.imap_folder)]
      return `${res.folders.length} folders loaded`
    }
    if (res.settings) applySettings(res.settings)
    return 'Email to print saved'
  })
}

watch([tab, () => props.active], () => {
  if (props.active !== false) void load()
}, { immediate: true })

// Setup runs in the print service, so the page asks how it is going.
let pollTimer: ReturnType<typeof setTimeout> | null = null
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    if (props.active !== false && !document.hidden && !busy.value) await load(true)
    schedulePoll()
  }, printersBusy(page.value) ? 2500 : 15000)
}
onMounted(schedulePoll)
watch(() => printersBusy(page.value), schedulePoll)
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<template>
  <div class="pp">
    <nav class="pp-tabs" aria-label="Printer settings">
      <button
        v-for="item in TABS"
        :key="item.id"
        type="button"
        class="chip"
        :class="{ on: tab === item.id }"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </nav>

    <p v-if="loadError" class="pp-flash is-bad" role="alert">{{ loadError }}</p>
    <p v-else-if="flashErr" class="pp-flash is-bad" role="alert">{{ flashErr }}</p>
    <p v-else-if="flashOk" class="pp-flash is-good" role="status">{{ flashOk }}</p>

    <template v-if="page">
      <p v-if="!page.engine.ok" class="pp-note is-bad" role="status">
        <strong>The print service is not running.</strong> {{ page.engine.message }}
        It deploys with the app as the <code>dorinc-print-engine</code> container.
      </p>

      <template v-else-if="tab === 'printers'">
        <form v-if="canManage" class="pp-add" @submit.prevent="addPrinter">
          <div class="pp-add__head">
            <h3>Add a printer</h3>
            <p>The make and model are read from the printer and a matching driver is installed.</p>
          </div>
          <label>Name
            <input v-model="addForm.label" required maxlength="100" placeholder="Office Printer">
          </label>
          <label>IP address
            <input v-model="addForm.host" required placeholder="192.168.1.50" inputmode="decimal" autocomplete="off" spellcheck="false">
          </label>
          <label><span>Tailscale auth key <span class="pp-opt">optional</span></span>
            <input v-model="addForm.authKey" type="password" autocomplete="off" spellcheck="false" placeholder="tskey-auth-…">
          </label>
          <button class="btn primary" type="submit" :disabled="busy === 'add' || Boolean(addedQueue && page.setups.some(item => item.running))">
            {{ busy === 'add' ? 'Starting…' : 'Add printer' }}
          </button>
          <p class="pp-add__help">
            Add a key when the printer is on another network. It joins your tailnet as its own device and is reached through your subnet router. The key is used once and is not saved.
          </p>
        </form>

        <div v-for="item in page.setups" :key="item.queue" class="pp-note" :class="{ 'is-bad': item.error }" role="status">
          <template v-if="item.running">
            <span class="pp-spin" aria-hidden="true" />
            <span>Setting up <strong>{{ item.label }}</strong> ({{ item.host }}): {{ item.phase || 'Working' }}…</span>
          </template>
          <template v-else>
            <span><strong>{{ item.label }} was not added.</strong> {{ item.error }}</span>
            <button v-if="canManage" type="button" class="pp-link" @click="dismissSetup(item.queue)">Dismiss</button>
          </template>
        </div>

        <article v-for="printer in page.printers" :key="printer.queue" class="pp-printer">
          <header class="pp-printer__head">
            <div>
              <h3>{{ printer.label }}</h3>
              <p>
                {{ printer.identity || 'Model not read yet' }} · {{ printer.host }}
                <template v-if="printer.stats?.pages_label"> · {{ printer.stats.pages_label }} pages</template>
              </p>
            </div>
            <span class="status-pill" :class="`is-${printerLiveTone(printer)}`">{{ printerLiveLabel(printer) }}</span>
          </header>

          <p v-if="printer.setup?.running" class="pp-note" role="status">
            <span class="pp-spin" aria-hidden="true" />
            <span>{{ printer.setup.phase || 'Working' }}…</span>
          </p>
          <p v-else-if="printer.setup?.error" class="pp-note is-bad" role="alert">
            <span>{{ printer.setup.error }}</span>
            <button v-if="canManage" type="button" class="pp-link" @click="dismissSetup(printer.queue)">Dismiss</button>
          </p>
          <p v-else-if="!printer.ready" class="pp-note is-warn" role="status">
            <span>
              The printer has not answered at {{ printer.host }}, so no driver is installed yet.
              <template v-if="printer.tail.hostname">Approve the route to it in the Tailscale admin console, then read it again.</template>
              <template v-else>Check the address and that it is switched on, then read it again.</template>
            </span>
          </p>

          <form v-if="canManage && editingQueue === printer.queue" class="pp-edit" @submit.prevent="saveEdit">
            <label>Name<input v-model="editForm.label" required maxlength="100"></label>
            <label>IP address<input v-model="editForm.host" required inputmode="decimal" autocomplete="off" spellcheck="false"></label>
            <div class="pp-actions">
              <button class="btn primary" type="submit" :disabled="busy === `edit-${printer.queue}`">Save</button>
              <button class="btn" type="button" @click="editingQueue = ''">Cancel</button>
            </div>
          </form>

          <PrinterStation
            v-else
            :queue="printer.queue"
            :label="printer.label"
            :image-url="printer.image.url"
            :pending="printer.image.pending"
            :condition="printer.condition"
            :supply-url="printer.supply?.url"
            :checks="printer.stats?.checks"
          />

          <div v-if="canManage" class="pp-bar">
            <button type="button" class="pp-link" :disabled="printer.setup?.running" @click="startEdit(printer)">Rename or move</button>
            <button type="button" class="pp-link" :disabled="printer.setup?.running || busy === `setup-${printer.queue}`" @click="readAgain(printer.queue)">Read printer again</button>
            <button v-if="printer.options?.length" type="button" class="pp-link" :aria-expanded="openPanel[printer.queue] === 'driver'" @click="togglePanel(printer.queue, 'driver')">Driver</button>
            <button type="button" class="pp-link" :aria-expanded="openPanel[printer.queue] === 'tailscale'" @click="togglePanel(printer.queue, 'tailscale')">
              Tailscale<template v-if="printer.tail.hostname"> · {{ printer.tail.state }}</template>
            </button>
            <button type="button" class="pp-link" :aria-expanded="openPanel[printer.queue] === 'picture'" @click="togglePanel(printer.queue, 'picture')">Picture</button>
            <button type="button" class="pp-link is-danger" :disabled="printer.setup?.running || busy === `rm-${printer.queue}`" @click="removePrinter(printer)">Remove</button>
          </div>

          <form v-if="canManage && openPanel[printer.queue] === 'driver'" class="pp-panel" @submit.prevent="saveOptions(printer.queue)">
            <p class="pp-panel__lead">
              <strong>{{ printer.driver_info?.name || printer.driver }}</strong>
              <template v-if="printer.driver_info?.package"> · {{ printer.driver_info.package }}</template>
              <template v-if="printer.driver_info?.connection"> · {{ printer.driver_info.connection }}</template>
            </p>
            <div class="pp-grid">
              <label v-for="opt in shownOptions(printer)" :key="opt.key">
                {{ opt.label }}
                <select v-model="draftsFor(printer.queue)[opt.key]">
                  <option v-for="choice in opt.choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
                </select>
              </label>
            </div>
            <div class="pp-actions">
              <button class="btn primary" type="submit" :disabled="busy === `opt-${printer.queue}`">Save driver settings</button>
              <button
                v-if="(printer.options?.length || 0) > MAIN_OPTIONS"
                type="button"
                class="pp-link"
                @click="allOptions[printer.queue] = !allOptions[printer.queue]"
              >
                {{ allOptions[printer.queue] ? 'Show fewer' : `Show all ${printer.options?.length} settings` }}
              </button>
            </div>
          </form>

          <div v-if="canManage && openPanel[printer.queue] === 'tailscale'" class="pp-panel">
            <template v-if="printer.tail.hostname">
              <p class="pp-panel__lead">
                <strong>{{ printer.tail.hostname }}</strong>
                <template v-if="printer.tail.ip"> · {{ printer.tail.ip }}</template>
                · {{ printer.tail.state }}
              </p>
              <p v-if="printer.tail.detail && !printer.tail.online" class="pp-help">{{ printer.tail.detail }}</p>
              <p class="pp-help">
                Print jobs and toner readings reach {{ printer.host }} through this device. A subnet router on the printer's network must advertise that address, with the route approved.
              </p>
            </template>
            <p v-else class="pp-help">
              {{ printer.label }} is reached directly. Join it to your tailnet when it sits on another network.
            </p>
            <form class="pp-inline" @submit.prevent="tailscale(printer, 'join')">
              <label>{{ printer.tail.hostname ? 'New auth key' : 'Auth key' }}
                <input v-model="tailKeys[printer.queue]" type="password" required autocomplete="off" spellcheck="false" placeholder="tskey-auth-…">
              </label>
              <button class="btn primary" type="submit" :disabled="busy === `tail-${printer.queue}` || printer.setup?.running">
                {{ printer.tail.hostname ? 'Join again' : 'Join tailnet' }}
              </button>
              <button v-if="printer.tail.hostname" class="btn" type="button" :disabled="busy === `tail-${printer.queue}` || printer.setup?.running" @click="tailscale(printer, 'leave')">
                Remove device
              </button>
            </form>
          </div>

          <div v-if="canManage && openPanel[printer.queue] === 'picture'" class="pp-panel">
            <p class="pp-help">
              <template v-if="printer.image.pending">Looking for a product photo of this model…</template>
              <template v-else>
                Showing: {{ printer.image.source_label || 'Illustration' }}<template v-if="printer.image.attribution"> · {{ printer.image.attribution }}</template><template v-if="printer.image.license"> · {{ printer.image.license }}</template>
              </template>
            </p>
            <div v-if="printer.image.candidates.length" class="pp-cands">
              <button
                v-for="cand in printer.image.candidates"
                :key="`${cand.kind}:${cand.id}`"
                type="button"
                class="pp-cand"
                :title="cand.title"
                :disabled="busy === `img-${printer.queue}`"
                @click="saveImage(printer.queue, 'apply', { choice: `${cand.kind}:${cand.id}` })"
              >
                <img :src="cand.url" alt="" loading="lazy" width="120" height="90">
                <span>{{ cand.title }}</span>
              </button>
            </div>
            <div v-if="previewAt[printer.queue]" class="pp-preview">
              <img :src="`/api/printers/${encodeURIComponent(printer.queue)}/image-preview?t=${previewAt[printer.queue]}`" alt="Preview of the uploaded picture" width="200" height="140">
              <div class="pp-actions">
                <button class="btn primary" type="button" :disabled="busy === `img-${printer.queue}`" @click="saveImage(printer.queue, 'apply-preview')">Use this picture</button>
                <button class="btn" type="button" @click="previewAt[printer.queue] = 0">Cancel</button>
              </div>
            </div>
            <div class="pp-grid">
              <label>Upload your own
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                  @change="saveImage(printer.queue, 'preview', { file: ($event.target as HTMLInputElement).files?.[0] })"
                >
              </label>
              <label>Or an illustration
                <select @change="saveImage(printer.queue, 'apply', { illustration: ($event.target as HTMLSelectElement).value })">
                  <option value="">Choose…</option>
                  <option v-for="cat in PRINTER_IMAGE_CATEGORIES" :key="cat" :value="cat">{{ IMAGE_CATEGORY_LABELS[cat] }}</option>
                </select>
              </label>
            </div>
            <div class="pp-actions">
              <button type="button" class="btn" :disabled="busy === `img-${printer.queue}`" @click="saveImage(printer.queue, 'search')">Look it up again</button>
              <button v-if="printer.image.mode === 'manual'" type="button" class="btn" :disabled="busy === `img-${printer.queue}`" @click="saveImage(printer.queue, 'auto')">Back to automatic</button>
            </div>
          </div>
        </article>

        <p v-if="!page.printers.length && !page.setups.length" class="pp-empty">No printer yet. Add the first one above.</p>

        <details v-if="page.events.length" class="pp-log">
          <summary>Recent activity</summary>
          <ul>
            <li v-for="row in page.events" :key="row.id" :class="`is-${row.level}`">
              <time>{{ formatPrinterWhen(row.created_at) }}</time>
              <span>{{ row.message }}</span>
            </li>
          </ul>
        </details>
      </template>

      <template v-else>
        <div class="pp-mailhead">
          <p>Email a document to one mailbox and it prints. Only mail that arrives after this is turned on is printed.</p>
          <div class="pp-health" :class="`is-${mailTone}`">
            <span class="pp-dot" />
            <div>
              <strong>{{ page.mail.state }}</strong>
              <small>{{ page.mail.detail || page.mail.checked || 'Not checked yet' }}</small>
            </div>
          </div>
        </div>
        <form v-if="canManage" class="pp-mail" @submit.prevent="saveMail(false)">
          <label class="pp-toggle">
            <input v-model="mailForm.mail_enabled" type="checkbox">
            <span><strong>Print documents sent by email</strong></span>
          </label>
          <div class="pp-grid">
            <label>Mailbox address
              <input v-model="mailForm.imap_user" type="email" placeholder="printer@gmail.com" autocomplete="off">
            </label>
            <label>App password
              <input v-model="mailForm.imap_password" type="password" autocomplete="new-password" :placeholder="passwordSaved ? 'Saved. Leave blank to keep it' : 'App password'">
            </label>
            <label>Folder
              <span class="pp-with-btn">
                <select v-model="mailForm.imap_folder">
                  <option v-for="folder in folders" :key="folder" :value="folder">{{ folder }}</option>
                </select>
                <button class="btn" type="button" :disabled="busy === 'folders'" @click="saveMail(true)">{{ busy === 'folders' ? 'Loading…' : 'Load folders' }}</button>
              </span>
            </label>
            <label>Print on
              <select v-model="mailForm.default_queue">
                <option value="">Choose a printer</option>
                <option v-for="printer in page.printers" :key="printer.queue" :value="printer.queue">{{ printer.label }}</option>
              </select>
            </label>
            <label>Sides
              <select v-model="mailForm.default_sides">
                <option value="one-sided">Single-sided</option>
                <option value="two-sided-long-edge">Two-sided, long edge</option>
                <option value="two-sided-short-edge">Two-sided, short edge</option>
              </select>
            </label>
            <label><span>Subject PIN <span class="pp-opt">optional</span></span>
              <input v-model="mailForm.email_pin" maxlength="32" autocomplete="off" spellcheck="false" placeholder="6 to 32 letters or digits">
            </label>
            <label class="span-2"><span>Allowed senders <span class="pp-opt">blank accepts anyone</span></span>
              <input v-model="mailForm.allowed_senders" placeholder="you@example.com, office@example.com" autocomplete="off">
            </label>
          </div>
          <label class="pp-toggle">
            <input v-model="mailForm.reply_enabled" type="checkbox">
            <span><strong>Reply to the sender with the result</strong></span>
          </label>
          <details class="pp-more">
            <summary>More options</summary>
            <div class="pp-grid">
              <label>IMAP server<input v-model="mailForm.imap_host" required autocomplete="off"></label>
              <label>IMAP port<input v-model.number="mailForm.imap_port" type="number" min="1" max="65535"></label>
              <label>SMTP server<input v-model="mailForm.smtp_host" autocomplete="off"></label>
              <label>SMTP port<input v-model.number="mailForm.smtp_port" type="number" min="1" max="65535"></label>
              <label><span>Reply from <span class="pp-opt">blank uses the mailbox</span></span>
                <input v-model="mailForm.smtp_from" type="email" autocomplete="off">
              </label>
              <label><span>Must be sent to <span class="pp-opt">blank accepts any To or Cc</span></span>
                <input v-model="mailForm.mail_recipient" type="email" autocomplete="off">
              </label>
              <label>Most pages per document<input v-model.number="mailForm.max_pages" type="number" min="1" max="200"></label>
              <label>Largest file (MB)<input v-model.number="mailForm.max_mb" type="number" min="1" max="30"></label>
              <label>Most attachments per email<input v-model.number="mailForm.max_files" type="number" min="1" max="10"></label>
              <label>Backup check every (seconds)<input v-model.number="mailForm.poll_seconds" type="number" min="2" max="3600"></label>
            </div>
            <label class="pp-toggle">
              <input v-model="mailForm.print_email_body" type="checkbox">
              <span><strong>Print the message text when there is no attachment</strong></span>
            </label>
          </details>
          <div class="pp-subject">
            <span>Subject line to use</span>
            <code>PRINT{{ subjectPin }}</code>
            <code>PRINT{{ subjectPin }} DUPLEX</code>
            <code>PRINT{{ subjectPin }} COPIES=3</code>
          </div>
          <div class="pp-actions">
            <button class="btn primary" type="submit" :disabled="busy === 'mail'">{{ busy === 'mail' ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
        <p v-else class="pp-empty">You need the Manage printers permission to change email to print.</p>
      </template>
    </template>
    <p v-else-if="!loadError" class="pp-empty">Loading printers…</p>
  </div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: 14px; }
.pp-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.pp-flash { margin: 0; padding: 9px 14px; border-radius: 12px; font-size: 13.5px; font-weight: 600; }
.pp-flash.is-bad { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; }
.pp-flash.is-good { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
.pp label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #64748b; min-width: 0; }
.pp input:not([type='checkbox']):not([type='file']), .pp select {
  width: 100%; min-width: 0; border: 1px solid #e2e8f0; border-radius: 10px; font: inherit; font-size: 14px;
  padding: 9px 12px; background: #fff; color: #0f172a;
}
.pp input:focus-visible, .pp select:focus-visible { outline: 2px solid #6366f1; outline-offset: 1px; }
.pp input[type='file'] { font-size: 13px; }
.pp-opt { font-weight: 500; color: #94a3b8; }

.pp-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr) auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}
.pp-add__head { grid-column: 1 / -1; }
.pp-add__head h3 { margin: 0; font-size: 15px; }
.pp-add__head p, .pp-add__help { margin: 3px 0 0; color: #64748b; font-size: 13px; }
.pp-add__help { grid-column: 1 / -1; margin: 0; }
.pp-add .btn { min-height: 40px; white-space: nowrap; }

.pp-note {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin: 0; padding: 10px 14px; border-radius: 12px;
  background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; font-size: 13.5px;
}
.pp-note > span:not(.pp-spin) { flex: 1; min-width: 12rem; }
.pp-note.is-bad { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.pp-note.is-warn { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.pp-note code { font-size: 12px; }
.pp-spin {
  width: 14px; height: 14px; border-radius: 50%; flex: none;
  border: 2px solid #bfdbfe; border-top-color: #2563eb; animation: pp-spin .8s linear infinite;
}
@keyframes pp-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pp-spin { animation: none; } }

.pp-printer {
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff;
}
.pp-printer__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.pp-printer__head h3 { margin: 0; font-size: 16px; letter-spacing: -0.02em; }
.pp-printer__head p { margin: 3px 0 0; color: #64748b; font-size: 13px; overflow-wrap: anywhere; }
.pp-bar { display: flex; flex-wrap: wrap; gap: 6px 18px; padding-top: 10px; border-top: 1px solid #f1f5f9; }
.pp-link {
  appearance: none; border: 0; background: none; padding: 4px 0; font: inherit; font-size: 13px;
  font-weight: 700; color: #4f46e5; cursor: pointer;
}
.pp-link[aria-expanded='true'] { text-decoration: underline; text-underline-offset: 4px; }
.pp-link.is-danger { color: #dc2626; margin-left: auto; }
.pp-link:disabled { opacity: .5; cursor: default; }
.pp-panel, .pp-edit {
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #eef2f7;
}
.pp-panel__lead { margin: 0; font-size: 13.5px; color: #0f172a; overflow-wrap: anywhere; }
.pp-help { margin: 0; color: #64748b; font-size: 13px; line-height: 1.45; }
.pp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.pp-edit { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; }
.span-2 { grid-column: span 2; }
.pp-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.pp-inline { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: end; }
.pp-cands { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.pp-cand {
  appearance: none; display: flex; flex-direction: column; gap: 6px; padding: 8px; cursor: pointer;
  border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; font: inherit; text-align: left;
}
.pp-cand:hover:not(:disabled) { border-color: #6366f1; }
.pp-cand img { width: 100%; height: 90px; object-fit: contain; }
.pp-cand span { font-size: 11.5px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-preview { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
.pp-preview img { width: 200px; height: 140px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
.pp-empty { margin: 0; color: #64748b; font-size: 14px; }

.pp-log { font-size: 13px; color: #475569; }
.pp-log summary { cursor: pointer; font-weight: 700; color: #64748b; }
.pp-log ul { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; max-height: 260px; overflow: auto; }
.pp-log li { display: grid; grid-template-columns: 9.5rem 1fr; gap: 10px; }
.pp-log time { color: #94a3b8; }
.pp-log li.is-error span { color: #b91c1c; }
.pp-log li.is-warning span { color: #b45309; }

.pp-mailhead { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
.pp-mailhead p { margin: 0; color: #64748b; font-size: 13.5px; max-width: 34rem; }
.pp-health { display: flex; gap: 10px; align-items: center; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
.pp-health strong { font-size: 13px; }
.pp-health small { display: block; color: #64748b; font-size: 12px; max-width: 22rem; }
.pp-dot { width: 10px; height: 10px; border-radius: 50%; background: #d97706; flex: none; }
.pp-health.is-good .pp-dot { background: #059669; }
.pp-health.is-bad .pp-dot { background: #dc2626; }
.pp-mail { display: flex; flex-direction: column; gap: 14px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
.pp label.pp-toggle { flex-direction: row; align-items: center; gap: 10px; font-size: 14px; color: #0f172a; cursor: pointer; }
.pp-with-btn { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.pp-more summary { cursor: pointer; font-size: 13px; font-weight: 700; color: #4f46e5; }
.pp-more[open] summary { margin-bottom: 12px; }
.pp-more .pp-toggle { margin-top: 12px; }
.pp-subject { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; font-weight: 600; color: #64748b; }
.pp-subject code { background: #f1f5f9; padding: 5px 9px; border-radius: 8px; font-size: 12px; color: #0f172a; }

.status-pill {
  display: inline-flex; align-items: center; flex: none; font-size: 11px; font-weight: 800;
  padding: 4px 9px; border-radius: 999px; background: #f1f5f9; color: #64748b; white-space: nowrap;
}
.status-pill.is-online { background: #ecfdf5; color: #059669; }
.status-pill.is-offline { background: #fef2f2; color: #dc2626; }
.status-pill.is-warn { background: #fffbeb; color: #d97706; }
.status-pill.is-wait { background: #eff6ff; color: #2563eb; }

@media (max-width: 900px) {
  .pp-add, .pp-edit, .pp-inline { grid-template-columns: 1fr; }
  .pp-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: auto; }
  .pp-link.is-danger { margin-left: 0; }
  .pp-log li { grid-template-columns: 1fr; gap: 0; }
}
</style>
