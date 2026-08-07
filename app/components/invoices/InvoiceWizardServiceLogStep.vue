<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { isVoiceEntryDevice } from '~/utils/voice-entry-device'

const props = defineProps<{
  customerId: string
  vehicleId: string
  invoiceId: string | null
  invoiceNumberFormatted: string | null
  serviceLogId: string
  serviceDate: string
  ensureDraft: () => Promise<string>
}>()

const emit = defineEmits<{
  'update:serviceLogId': [id: string]
  'attached': [payload: { serviceLogId: string, invoiceNumberFormatted: string | null }]
  'skip': []
  'done': []
  'back': []
}>()

type Tech = { id: string, name: string, email: string, accountType: string }
type DesktopMethod = 'upload' | 'qr'

const wantUpload = ref<boolean | null>(null)
const technicianId = ref('')
const desktopMethod = ref<DesktopMethod>('upload')
const busy = ref(false)
const error = ref('')
const localPreviews = ref<{ id: string, url: string, file: File }[]>([])
const successOpen = ref(false)
const successInvoiceLabel = ref('')
const extractOpen = ref(false)
const extractFileId = ref<string | null>(null)

const qrOpen = ref(false)
const qrDataUrl = ref('')
const qrUploadUrl = ref('')
const qrSessionId = ref('')
const qrStatus = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

const isMobile = ref(false)
onMounted(() => {
  isMobile.value = isVoiceEntryDevice() || window.matchMedia('(max-width: 820px)').matches
})

const { data: techData, pending: techPending } = useClientFetch<{
  items: Tech[]
  source: 'mechanics' | 'all_staff'
}>('/api/staff/technicians')

const technicians = computed(() => techData.value?.items ?? [])
const techSource = computed(() => techData.value?.source ?? 'all_staff')

watch(technicians, (items) => {
  if (!technicianId.value && items[0]) technicianId.value = items[0].id
}, { immediate: true })

function selectWant(value: boolean) {
  wantUpload.value = value
  error.value = ''
  if (!value) {
    clearLocal()
    void cancelQr()
  }
}

function clearLocal() {
  for (const p of localPreviews.value) URL.revokeObjectURL(p.url)
  localPreviews.value = []
}

function onCaptured(file: File) {
  localPreviews.value.push({
    id: crypto.randomUUID(),
    url: URL.createObjectURL(file),
    file,
  })
}

function onDesktopFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const file of files) {
    if (file.type.startsWith('image/')) onCaptured(file)
  }
}

function removePreview(id: string) {
  const idx = localPreviews.value.findIndex(p => p.id === id)
  if (idx < 0) return
  URL.revokeObjectURL(localPreviews.value[idx]!.url)
  localPreviews.value.splice(idx, 1)
}

async function buildQrDataUrl(url: string): Promise<string> {
  try {
    const QRCode = (await import('qrcode')).default
    return await QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  }
  catch {
    return ''
  }
}

async function startQrSession() {
  if (!technicianId.value) {
    error.value = 'Select a technician first'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const invoiceId = await props.ensureDraft()
    const res = await $fetch<{
      session: {
        id: string
        uploadUrl: string
        serviceLogId: string | null
        invoiceNumberFormatted: string | null
      }
      token: string
    }>('/api/invoices/wizard/service-log-upload-sessions', {
      method: 'POST',
      body: {
        customerId: props.customerId,
        vehicleId: props.vehicleId,
        technicianId: technicianId.value,
        invoiceId,
        serviceDate: props.serviceDate,
      },
    })

    if (res.session.serviceLogId) {
      emit('update:serviceLogId', res.session.serviceLogId)
    }
    qrSessionId.value = res.session.id
    qrUploadUrl.value = res.session.uploadUrl
    qrDataUrl.value = await buildQrDataUrl(res.session.uploadUrl)
    qrOpen.value = true
    qrStatus.value = 'pending'
    startPoll()
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not start QR upload')
  }
  finally {
    busy.value = false
  }
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(async () => {
    if (!qrSessionId.value) return
    try {
      const { session } = await $fetch<{
        session: {
          status: string
          serviceLogId: string | null
          invoiceNumberFormatted: string | null
          photoCount: number
        }
      }>(`/api/invoices/wizard/service-log-upload-sessions/${qrSessionId.value}`)
      qrStatus.value = session.status
      if (session.serviceLogId) emit('update:serviceLogId', session.serviceLogId)
      if (session.status === 'completed') {
        stopPoll()
        successInvoiceLabel.value = session.invoiceNumberFormatted
          || props.invoiceNumberFormatted
          || 'your invoice'
        qrOpen.value = false
        successOpen.value = true
        emit('attached', {
          serviceLogId: session.serviceLogId || props.serviceLogId,
          invoiceNumberFormatted: session.invoiceNumberFormatted,
        })
      }
      else if (session.status === 'expired' || session.status === 'cancelled') {
        stopPoll()
        error.value = session.status === 'expired'
          ? 'QR upload expired — start a new one'
          : 'QR upload was cancelled'
      }
    }
    catch {
      // keep polling
    }
  }, 2000)
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function cancelQr() {
  stopPoll()
  const id = qrSessionId.value
  qrOpen.value = false
  qrSessionId.value = ''
  qrUploadUrl.value = ''
  qrDataUrl.value = ''
  if (!id) return
  await $fetch(`/api/invoices/wizard/service-log-upload-sessions/${id}/cancel`, {
    method: 'POST',
  }).catch(() => {})
}

async function attachLocalUploads() {
  if (!technicianId.value) {
    error.value = 'Select a technician first'
    return
  }
  if (!localPreviews.value.length) {
    error.value = 'Add at least one photo'
    return
  }
  if (!props.vehicleId) {
    error.value = 'Select a vehicle before uploading a service log'
    return
  }

  busy.value = true
  error.value = ''
  try {
    const invoiceId = await props.ensureDraft()
    const created = await $fetch<{
      session: {
        id: string
        serviceLogId: string | null
        invoiceNumberFormatted: string | null
      }
      token: string
    }>('/api/invoices/wizard/service-log-upload-sessions', {
      method: 'POST',
      body: {
        customerId: props.customerId,
        vehicleId: props.vehicleId,
        technicianId: technicianId.value,
        invoiceId,
        serviceDate: props.serviceDate,
      },
    })

    const logId = created.session.serviceLogId
    if (!logId) throw new Error('Service log missing from upload session')
    emit('update:serviceLogId', logId)

    for (const preview of localPreviews.value) {
      const form = new FormData()
      form.append('file', preview.file, preview.file.name)
      await $fetch(`/api/public/service-log-upload/${created.token}/files`, {
        method: 'POST',
        body: form,
      })
    }

    const done = await $fetch<{
      session: {
        serviceLogId: string | null
        invoiceNumberFormatted: string | null
      }
    }>(`/api/invoices/wizard/service-log-upload-sessions/${created.session.id}/complete`, {
      method: 'POST',
    })

    successInvoiceLabel.value = done.session.invoiceNumberFormatted
      || props.invoiceNumberFormatted
      || 'your invoice'
    successOpen.value = true
    emit('attached', {
      serviceLogId: done.session.serviceLogId || logId,
      invoiceNumberFormatted: done.session.invoiceNumberFormatted,
    })
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not attach service log')
  }
  finally {
    busy.value = false
  }
}

function closeSuccessAndContinue() {
  successOpen.value = false
  emit('done')
}

function openExtract() {
  extractFileId.value = null
  extractOpen.value = true
}

function continueGate() {
  error.value = ''
  if (wantUpload.value === null) {
    error.value = 'Choose whether to upload a service log'
    return
  }
  if (wantUpload.value === false) {
    emit('skip')
    return
  }
  if (!props.serviceLogId) {
    error.value = 'Attach the service log photos, or choose continue without'
    return
  }
  emit('done')
}

onBeforeUnmount(() => {
  stopPoll()
  clearLocal()
})
</script>

<template>
  <div class="inv-sl-step">
    <h3>Upload a service log?</h3>
    <p class="sl-hint">
      Optionally photograph a paper service log now. We’ll save it under the technician you pick
      and can extract line items for this invoice.
    </p>

    <div class="inv-sl-choice" role="group" aria-label="Upload service log choice">
      <button
        type="button"
        class="inv-sl-choice-btn"
        :class="{ on: wantUpload === true }"
        @click="selectWant(true)"
      >
        <span class="inv-sl-choice-btn__title">Yes — upload service log</span>
        <span class="inv-sl-choice-btn__sub">Photos create a service log on this invoice</span>
      </button>
      <button
        type="button"
        class="inv-sl-choice-btn"
        :class="{ on: wantUpload === false }"
        @click="selectWant(false)"
      >
        <span class="inv-sl-choice-btn__title">No — continue without</span>
        <span class="inv-sl-choice-btn__sub">Skip for now and keep building the invoice</span>
      </button>
    </div>

    <template v-if="wantUpload">
      <label class="fld" style="margin-top:16px;">
        <span>Technician</span>
        <select v-model="technicianId" :disabled="techPending || busy">
          <option disabled value="">
            {{ techPending ? 'Loading…' : 'Select technician' }}
          </option>
          <option v-for="t in technicians" :key="t.id" :value="t.id">
            {{ t.name }}
          </option>
        </select>
        <span class="help">
          {{ techSource === 'mechanics'
            ? 'Showing mechanic accounts — the log and team message are attributed to them.'
            : 'No mechanic accounts found — showing all staff.' }}
        </span>
      </label>

      <template v-if="isMobile">
        <ServiceLogDocumentCamera style="margin-top:14px;" @captured="onCaptured" />
      </template>
      <template v-else>
        <div class="inv-sl-methods">
          <button
            type="button"
            class="btn"
            :class="{ primary: desktopMethod === 'upload' }"
            @click="desktopMethod = 'upload'"
          >
            Upload photos
          </button>
          <button
            type="button"
            class="btn"
            :class="{ primary: desktopMethod === 'qr' }"
            @click="desktopMethod = 'qr'"
          >
            QR code
          </button>
        </div>

        <div v-if="desktopMethod === 'upload'" class="inv-sl-upload-zone">
          <label class="inv-sl-drop">
            <input type="file" accept="image/*" multiple @change="onDesktopFiles">
            <b>Drop photos here</b>
            <small>or click to browse</small>
          </label>
        </div>
        <div v-else class="inv-sl-qr-cta">
          <p class="help">
            Scan with your phone to open a simple upload page (no login). Photos attach to this invoice when you finish.
          </p>
          <button
            type="button"
            class="btn primary"
            :disabled="busy || !technicianId"
            @click="startQrSession"
          >
            Show QR code
          </button>
        </div>
      </template>

      <div v-if="localPreviews.length" class="inv-sl-thumbs">
        <div v-for="p in localPreviews" :key="p.id" class="inv-sl-thumb">
          <img :src="p.url" alt="Service log photo">
          <button type="button" class="inv-sl-thumb__x" @click="removePreview(p.id)">×</button>
        </div>
      </div>

      <div v-if="localPreviews.length" class="inv-sl-attach-row">
        <button
          type="button"
          class="btn primary"
          :disabled="busy || !technicianId"
          @click="attachLocalUploads"
        >
          {{ busy ? 'Attaching…' : 'Attach to invoice' }}
        </button>
        <button
          v-if="serviceLogId"
          type="button"
          class="btn"
          :disabled="busy"
          @click="openExtract"
        >
          Extract line items
        </button>
      </div>
    </template>

    <p v-if="error" class="help inv-sl-error">{{ error }}</p>

    <div class="sl-foot">
      <button type="button" class="btn" :disabled="busy" @click="emit('back')">Back</button>
      <button
        type="button"
        class="btn primary"
        :disabled="busy"
        @click="continueGate"
      >
        Continue
      </button>
    </div>

    <div v-if="qrOpen" class="inv-sl-modal" role="dialog" aria-modal="true">
      <div class="inv-sl-modal__card">
        <h4>Scan to upload</h4>
        <p class="help">
          Open the link on your phone, photograph the service log, then tap Done.
          Status: <b>{{ qrStatus || 'waiting' }}</b>
        </p>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code for service log upload" class="inv-sl-qr">
        <p v-else class="help">QR preview unavailable — open this link on your phone:</p>
        <p class="inv-sl-link">{{ qrUploadUrl }}</p>
        <div class="inv-sl-modal__actions">
          <button type="button" class="btn" @click="cancelQr">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="successOpen" class="inv-sl-modal inv-sl-success" role="dialog" aria-modal="true">
      <div class="inv-sl-modal__card inv-sl-success__card">
        <div class="inv-sl-success__burst" aria-hidden="true" />
        <div class="inv-sl-success__check" aria-hidden="true">✓</div>
        <h4>Successfully attached</h4>
        <p>
          Service log photos are on
          <b>{{ successInvoiceLabel }}</b>
        </p>
        <div class="inv-sl-modal__actions">
          <button
            v-if="serviceLogId"
            type="button"
            class="btn"
            @click="openExtract()"
          >
            Extract line items
          </button>
          <button type="button" class="btn primary" @click="closeSuccessAndContinue">
            Continue
          </button>
        </div>
      </div>
    </div>

    <ServiceLogAiExtractModal
      :open="extractOpen"
      :service-log-id="serviceLogId"
      :selected-file-id="extractFileId"
      :can-extract="Boolean(serviceLogId)"
      @close="extractOpen = false"
      @refreshed="extractOpen = false"
    />
  </div>
</template>
