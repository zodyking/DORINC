<script setup lang="ts">
/**
 * Post-vehicle service log upload prompt (not a numbered wizard step).
 * Desktop: neat photo dropzone (+ phone QR). Mobile: camera icon → 100dvh capture.
 */
import ServiceLogDocumentCamera from '~/components/service-logs/ServiceLogDocumentCamera.vue'
import ServiceLogAiExtractModal from '~/components/service-logs/ServiceLogAiExtractModal.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { isVoiceEntryDevice } from '~/utils/voice-entry-device'

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
type DesktopMethod = 'upload' | 'qr'

const technicianId = ref('')
const technicians = ref<Tech[]>([])
const techSource = ref<'mechanics' | 'all_staff'>('all_staff')
const techPending = ref(false)
const desktopMethod = ref<DesktopMethod>('upload')
const busy = ref(false)
const error = ref('')
const localPreviews = ref<{ id: string, url: string, file: File }[]>([])
const successOpen = ref(false)
const successInvoiceLabel = ref('')
const extractOpen = ref(false)
const extractFileId = ref<string | null>(null)
const cameraOpen = ref(false)

const qrOpen = ref(false)
const qrDataUrl = ref('')
const qrUploadUrl = ref('')
const qrSessionId = ref('')
const qrStatus = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

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

watch(() => props.open, (open) => {
  if (!open) {
    stopPoll()
    qrOpen.value = false
    successOpen.value = false
    extractOpen.value = false
    cameraOpen.value = false
    return
  }
  error.value = ''
  successOpen.value = false
  qrOpen.value = false
  cameraOpen.value = false
  clearLocal()
  void loadTechnicians()
})

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
  // Keep fullscreen open so they can shoot another page; close if they prefer from X.
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
  cameraOpen.value = false
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
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-scrim open inv-sl-scrim"
      role="presentation"
      @click.self="!busy && !cameraOpen && emit('back')"
    >
      <div
        class="modal inv-sl-modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-sl-upload-title"
        @click.stop
      >
        <header class="inv-sl-modal-sheet__head">
          <div>
            <p class="inv-sl-kicker">Upload Service Log</p>
            <h2 id="inv-sl-upload-title">Speed Up This Invoice</h2>
            <p class="inv-sl-modal-sheet__sub">
              Add the paper log and AI can extract line items so invoicing goes faster.
            </p>
          </div>
          <button
            type="button"
            class="btn sm"
            aria-label="Close"
            :disabled="busy"
            @click="emit('back')"
          >
            ✕
          </button>
        </header>

        <div class="inv-sl-modal-sheet__body">
          <label class="fld">
            <span>Technician</span>
            <select v-model="technicianId" :disabled="techPending || busy">
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

          <template v-if="isMobile">
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
              <span class="inv-sl-cam-launch__title">Take Photo</span>
              <span class="inv-sl-cam-launch__sub">Open full-screen camera</span>
            </button>
            <label class="inv-sl-text-link">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                @change="onDesktopFiles"
              >
              Or Choose from Gallery
            </label>
          </template>
          <template v-else>
            <div class="inv-sl-methods" role="group" aria-label="Upload method">
              <button
                type="button"
                class="btn"
                :class="{ primary: desktopMethod === 'upload' }"
                @click="desktopMethod = 'upload'"
              >
                Upload Photos
              </button>
              <button
                type="button"
                class="btn"
                :class="{ primary: desktopMethod === 'qr' }"
                @click="desktopMethod = 'qr'"
              >
                Phone QR
              </button>
            </div>

            <div v-if="desktopMethod === 'upload'" class="inv-sl-upload-zone">
              <label class="inv-sl-drop inv-sl-drop--neat">
                <input type="file" accept="image/*" multiple @change="onDesktopFiles">
                <span class="inv-sl-drop__icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                    <rect x="8" y="10" width="32" height="28" rx="6" stroke="#6366f1" stroke-width="2.2" />
                    <path d="M16 30l6-7 5 5 3-3 6 5" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                    <circle cx="19" cy="18" r="2.5" fill="#6366f1" />
                  </svg>
                </span>
                <b>Upload Service Log Photos</b>
                <small>Drop images here, or click to browse</small>
              </label>
            </div>
            <div v-else class="inv-sl-qr-cta">
              <p class="help">
                Scan with your phone for a full-screen camera — no login on the upload page.
              </p>
              <button
                type="button"
                class="btn primary"
                :disabled="busy || !technicianId"
                @click="startQrSession"
              >
                Show QR Code
              </button>
            </div>
          </template>

          <div v-if="localPreviews.length" class="inv-sl-thumbs">
            <div v-for="p in localPreviews" :key="p.id" class="inv-sl-thumb">
              <img :src="p.url" alt="Service log photo">
              <button type="button" class="inv-sl-thumb__x" aria-label="Remove photo" @click="removePreview(p.id)">×</button>
            </div>
          </div>

          <div v-if="localPreviews.length" class="inv-sl-attach-row">
            <button
              type="button"
              class="btn primary"
              :disabled="busy || !technicianId"
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
        </div>

        <footer class="inv-sl-modal-sheet__foot">
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
        </footer>
      </div>
    </div>
  </Teleport>

  <ClientOnly>
    <ServiceLogDocumentCamera
      mode="fullscreen"
      :open="cameraOpen"
      @captured="onCaptured"
      @close="cameraOpen = false"
    />
  </ClientOnly>

  <Teleport to="body">
    <div
      v-if="qrOpen"
      class="modal-scrim open inv-sl-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Scan QR to upload"
    >
      <div class="modal inv-sl-modal-sheet inv-sl-modal-sheet--sm">
        <h3>Scan to Upload</h3>
        <p class="help">
          Open on your phone, photograph the Service Log, then tap Done.
          Status: <b>{{ qrStatus || 'waiting' }}</b>
        </p>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR code for service log upload" class="inv-sl-qr">
        <p v-else class="help">QR preview unavailable — open this link on your phone:</p>
        <p class="inv-sl-link">{{ qrUploadUrl }}</p>
        <div class="inv-sl-modal-sheet__foot">
          <button type="button" class="btn" @click="cancelQr">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>

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
