<script setup lang="ts">
/**
 * Invoice wizard Service log step (numbered when AI extraction is on).
 * Desktop: upload dropzone + live QR side by side.
 * Mobile: camera icon → 100dvh capture.
 */
import ServiceLogDocumentCamera from '~/components/service-logs/ServiceLogDocumentCamera.vue'
import ServiceLogAiExtractModal from '~/components/service-logs/ServiceLogAiExtractModal.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { isVoiceEntryDevice } from '~/utils/voice-entry-device'
import {
  SERVICE_LOG_MAX_PHOTOS,
  serviceLogPhotoSlotLabel,
} from '#shared/service-log-photos'

const props = defineProps<{
  open: boolean
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
  'done': []
  'back': []
}>()

type Tech = { id: string, name: string, email: string, accountType: string }

const technicianId = ref('')
const technicians = ref<Tech[]>([])
const techSource = ref<'mechanics' | 'all_staff'>('all_staff')
const techPending = ref(false)
const busy = ref(false)
const qrBusy = ref(false)
const error = ref('')
const localPreviews = ref<{ id: string, url: string, file: File }[]>([])
const successOpen = ref(false)
const successInvoiceLabel = ref('')
const extractOpen = ref(false)
const extractFileId = ref<string | null>(null)
const cameraOpen = ref(false)

const qrDataUrl = ref('')
const qrUploadUrl = ref('')
const qrSessionId = ref('')
const qrStatus = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null
let qrRequestSeq = 0

const isMobile = computed(() => {
  if (!import.meta.client) return false
  try {
    return isVoiceEntryDevice() || window.matchMedia('(max-width: 820px)').matches
  }
  catch {
    return true
  }
})

async function loadTechnicians() {
  techPending.value = true
  try {
    const res = await $fetch<{ items: Tech[], source: 'mechanics' | 'all_staff' }>(
      '/api/staff/technicians',
    )
    technicians.value = res.items ?? []
    techSource.value = res.source ?? 'all_staff'
    if (!technicianId.value && technicians.value[0]) {
      technicianId.value = technicians.value[0].id
    }
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not load technicians')
    technicians.value = []
  }
  finally {
    techPending.value = false
  }
}

watch(() => props.open, async (open) => {
  if (!open) {
    stopPoll()
    await cancelQr(false)
    successOpen.value = false
    extractOpen.value = false
    cameraOpen.value = false
    return
  }
  error.value = ''
  successOpen.value = false
  cameraOpen.value = false
  clearLocal()
  await loadTechnicians()
  if (!isMobile.value && technicianId.value && props.vehicleId) {
    void ensureQrSession()
  }
})

watch(technicianId, async (id, prev) => {
  if (!props.open || isMobile.value || !id || id === prev) return
  await cancelQr(false)
  if (props.vehicleId) void ensureQrSession()
})

function clearLocal() {
  for (const p of localPreviews.value) URL.revokeObjectURL(p.url)
  localPreviews.value = []
}

function onCaptured(file: File) {
  if (localPreviews.value.length >= SERVICE_LOG_MAX_PHOTOS) {
    error.value = 'Max 2 photos — front and back only. Remove one to retake.'
    return
  }
  error.value = ''
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
    if (!file.type.startsWith('image/')) continue
    if (localPreviews.value.length >= SERVICE_LOG_MAX_PHOTOS) {
      error.value = 'Max 2 photos — front and back only. Remove one to retake.'
      break
    }
    onCaptured(file)
  }
}

const cameraPhotos = computed(() => localPreviews.value.map(p => ({ id: p.id, url: p.url })))

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
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  }
  catch {
    return ''
  }
}

async function ensureQrSession() {
  if (!technicianId.value || isMobile.value || qrBusy.value || busy.value) return
  if (qrSessionId.value && (qrStatus.value === 'pending' || qrStatus.value === 'uploading')) return
  if (!props.vehicleId) {
    error.value = 'Select a vehicle before uploading a service log'
    return
  }
  if (!props.customerId) {
    error.value = 'Select a customer before uploading a service log'
    return
  }

  const seq = ++qrRequestSeq
  qrBusy.value = true
  error.value = ''
  try {
    let invoiceId: string
    try {
      invoiceId = await props.ensureDraft()
    }
    catch (e: unknown) {
      if (seq === qrRequestSeq) {
        error.value = syncFetchErrorMessage(e, 'Could not save invoice draft for upload')
      }
      return
    }
    if (seq !== qrRequestSeq) return

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

    if (seq !== qrRequestSeq) return

    if (res.session.serviceLogId) {
      emit('update:serviceLogId', res.session.serviceLogId)
    }
    qrSessionId.value = res.session.id
    qrUploadUrl.value = res.session.uploadUrl
    qrDataUrl.value = await buildQrDataUrl(res.session.uploadUrl)
    qrStatus.value = 'pending'
    startPoll()
  }
  catch (e: unknown) {
    if (seq === qrRequestSeq) {
      error.value = syncFetchErrorMessage(e, 'Could not start QR upload')
    }
  }
  finally {
    if (seq === qrRequestSeq) qrBusy.value = false
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
        }
      }>(`/api/invoices/wizard/service-log-upload-sessions/${qrSessionId.value}`)
      qrStatus.value = session.status
      if (session.serviceLogId) emit('update:serviceLogId', session.serviceLogId)
      if (session.status === 'completed') {
        stopPoll()
        successInvoiceLabel.value = session.invoiceNumberFormatted
          || props.invoiceNumberFormatted
          || 'your invoice'
        successOpen.value = true
        emit('attached', {
          serviceLogId: session.serviceLogId || props.serviceLogId,
          invoiceNumberFormatted: session.invoiceNumberFormatted,
        })
      }
      else if (session.status === 'expired' || session.status === 'cancelled') {
        stopPoll()
        error.value = session.status === 'expired'
          ? 'QR upload expired — tap Refresh QR'
          : 'QR upload was cancelled'
        qrSessionId.value = ''
        qrDataUrl.value = ''
        qrUploadUrl.value = ''
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

async function cancelQr(notify = true) {
  stopPoll()
  qrRequestSeq += 1
  const id = qrSessionId.value
  qrSessionId.value = ''
  qrUploadUrl.value = ''
  qrDataUrl.value = ''
  qrStatus.value = ''
  if (!id) return
  await $fetch(`/api/invoices/wizard/service-log-upload-sessions/${id}/cancel`, {
    method: 'POST',
  }).catch(() => {})
  if (notify) error.value = ''
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
  if (!props.customerId) {
    error.value = 'Select a customer before uploading a service log'
    return
  }

  busy.value = true
  error.value = ''
  cameraOpen.value = false
  try {
    let invoiceId: string
    try {
      invoiceId = await props.ensureDraft()
    }
    catch (e: unknown) {
      error.value = syncFetchErrorMessage(e, 'Could not save invoice draft for upload')
      return
    }
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

function continueWithoutPhotos() {
  cameraOpen.value = false
  emit('done')
}

onBeforeUnmount(() => {
  stopPoll()
  clearLocal()
})
</script>

<template>
  <div v-show="open" class="inv-sl-step">
    <p class="inv-sl-kicker">Upload Service Log</p>
    <h3>Speed Up This Invoice</h3>
    <p class="sl-hint">
      Upload photos or scan the QR code — AI can extract line items so invoicing goes faster.
    </p>

    <label class="fld">
      <span>Technician</span>
      <select v-model="technicianId" :disabled="techPending || busy || qrBusy">
        <option disabled value="">
          {{ techPending ? 'Loading…' : 'Select Technician' }}
        </option>
        <option v-for="t in technicians" :key="t.id" :value="t.id">
          {{ t.name }}
        </option>
      </select>
      <span class="help">
        {{ techSource === 'mechanics'
          ? 'Attributed to this mechanic on the log and team chat.'
          : 'No mechanic accounts yet — picking from all staff.' }}
      </span>
    </label>

    <p v-if="!vehicleId" class="help inv-sl-error" style="margin-top:12px;">
      Select a vehicle on the previous step before uploading a service log.
    </p>

    <template v-else-if="isMobile">
      <button
        type="button"
        class="inv-sl-cam-launch"
        :disabled="busy"
        @click="cameraOpen = true"
      >
        <span class="inv-sl-cam-launch__icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
            <rect x="6" y="12" width="36" height="26" rx="8" stroke="currentColor" stroke-width="2.4" />
            <circle cx="24" cy="25" r="8" stroke="currentColor" stroke-width="2.4" />
            <path d="M18 12l2.2-4h7.6L30 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="inv-sl-cam-launch__title">
          {{ localPreviews.length ? 'Retake Photos' : 'Take Photos' }}
        </span>
        <span class="inv-sl-cam-launch__sub">Front and back of the paper log</span>
      </button>
    </template>
    <template v-else>
      <p class="inv-sl-choice-heading">Upload or scan QR code</p>
      <div class="inv-sl-split" role="group" aria-label="Upload or scan QR code">
        <label class="inv-sl-drop inv-sl-drop--neat">
          <input type="file" accept="image/*" multiple @change="onDesktopFiles">
          <span class="inv-sl-drop__icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
              <rect x="8" y="10" width="32" height="28" rx="6" stroke="#6366f1" stroke-width="2.2" />
              <path d="M16 30l6-7 5 5 3-3 6 5" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="19" cy="18" r="2.5" fill="#6366f1" />
            </svg>
          </span>
          <b>Upload front &amp; back</b>
          <small>Max 2 photos — drop or click to browse</small>
        </label>

        <div class="inv-sl-qr-panel">
          <template v-if="qrDataUrl">
            <img :src="qrDataUrl" alt="QR code for phone upload" class="inv-sl-qr-panel__img">
            <b>Scan with phone</b>
            <small>
              Status:
              <strong>{{ qrStatus || 'waiting' }}</strong>
            </small>
            <button
              type="button"
              class="btn sm"
              :disabled="qrBusy || busy"
              @click="cancelQr(false).then(() => ensureQrSession())"
            >
              Refresh QR
            </button>
          </template>
          <template v-else-if="qrBusy || techPending">
            <span class="inv-sl-qr-panel__spinner" aria-hidden="true" />
            <b>Preparing QR…</b>
            <small>Ready in a moment</small>
          </template>
          <template v-else>
            <b>QR unavailable</b>
            <small>Select a technician, then try again.</small>
            <button
              type="button"
              class="btn sm primary"
              :disabled="!technicianId || !vehicleId || qrBusy || busy"
              @click="ensureQrSession"
            >
              Show QR Code
            </button>
          </template>
        </div>
      </div>
    </template>

    <div v-if="localPreviews.length" class="inv-sl-thumbs">
      <div v-for="(p, index) in localPreviews" :key="p.id" class="inv-sl-thumb">
        <img :src="p.url" :alt="`${serviceLogPhotoSlotLabel(index)} of service log`">
        <span class="inv-sl-thumb__label">{{ serviceLogPhotoSlotLabel(index) }}</span>
        <button
          type="button"
          class="inv-sl-thumb__x"
          :aria-label="`Remove ${serviceLogPhotoSlotLabel(index).toLowerCase()} photo`"
          @click="removePreview(p.id)"
        >
          ×
        </button>
      </div>
    </div>

    <div v-if="localPreviews.length" class="inv-sl-attach-row">
      <button
        type="button"
        class="btn primary"
        :disabled="busy || !technicianId || !vehicleId"
        @click="attachLocalUploads"
      >
        {{ busy ? 'Attaching…' : 'Attach Photos' }}
      </button>
      <button
        v-if="serviceLogId"
        type="button"
        class="btn"
        :disabled="busy"
        @click="openExtract"
      >
        Extract Line Items
      </button>
    </div>

    <p v-if="error" class="help inv-sl-error">{{ error }}</p>

    <div class="sl-foot">
      <button type="button" class="btn" :disabled="busy" @click="emit('back')">
        Back
      </button>
      <button
        type="button"
        class="btn"
        :class="{ primary: Boolean(serviceLogId) }"
        :disabled="busy"
        @click="continueWithoutPhotos"
      >
        {{ serviceLogId ? 'Continue' : 'Skip for Now' }}
      </button>
    </div>
  </div>

  <ClientOnly>
    <ServiceLogDocumentCamera
      mode="fullscreen"
      :open="cameraOpen"
      :photos="cameraPhotos"
      @captured="onCaptured"
      @remove="removePreview"
      @done="cameraOpen = false"
      @close="cameraOpen = false"
    />
  </ClientOnly>

  <Teleport to="body">
    <div
      v-if="successOpen"
      class="modal-scrim open inv-sl-scrim inv-sl-success"
      role="dialog"
      aria-modal="true"
      aria-label="Service log attached"
    >
      <div class="modal inv-sl-modal-sheet inv-sl-modal-sheet--sm inv-sl-success__card">
        <div class="inv-sl-success__burst" aria-hidden="true" />
        <div class="inv-sl-success__check" aria-hidden="true">✓</div>
        <h3>Service Log Attached</h3>
        <p>
          Photos are on <b>{{ successInvoiceLabel }}</b>.
          Next, AI can extract line items to finish faster.
        </p>
        <div class="inv-sl-modal-sheet__foot">
          <button
            v-if="serviceLogId"
            type="button"
            class="btn"
            @click="openExtract()"
          >
            Extract Line Items
          </button>
          <button type="button" class="btn primary" @click="closeSuccessAndContinue">
            Continue
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <ServiceLogAiExtractModal
    :open="extractOpen"
    :service-log-id="serviceLogId"
    :selected-file-id="extractFileId"
    :can-extract="Boolean(serviceLogId)"
    @close="extractOpen = false"
    @refreshed="extractOpen = false"
  />
</template>
