<script setup lang="ts">
/**
 * Printed service-log sheet QR landing.
 * Device cookie → “Are you …?” → login (with return) or simple upload wizard.
 */
import ServiceLogDocumentCamera from '~/components/service-logs/ServiceLogDocumentCamera.vue'
import ServiceLogPhotoLightbox from '~/components/service-logs/ServiceLogPhotoLightbox.vue'
import { BRAND_NAME } from '~/constants/brand'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { setStaffReturnPath, consumeStaffReturnAutoContinue } from '~/utils/staff-return-path'
import { vehicleSub, vehicleTag } from '~/utils/vehicles-ui'
import {
  SERVICE_LOG_MAX_PHOTOS,
  serviceLogPhotoSlotLabel,
} from '#shared/service-log-photos'
import { SERVICE_LOG_SHEET_UPLOAD_PATH } from '#shared/service-log-sheet-upload'
import { logNumberDisplay } from '~/utils/service-logs-ui'

definePageMeta({
  layout: false,
  ssr: false,
})

useHead({
  title: `Upload Service Log · ${BRAND_NAME}`,
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
  ],
})

type ContextMode = 'signed_in' | 'suggested' | 'anonymous'
type Phase = 'boot' | 'confirm' | 'wizard' | 'done'

interface ContextUser {
  id: string
  name: string
  email: string
}

interface CustomerPick {
  id: string
  displayName: string
  accountKind: string
}

interface VehiclePick {
  id: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
}

const auth = useAuthStore()
const phase = ref<Phase>('boot')
const bootError = ref('')
const confirmName = ref('')
const confirmEmail = ref('')
const wizardStep = ref(1)
const busy = ref(false)
const actionError = ref('')
const cameraOpen = ref(false)
const previewId = ref<string | null>(null)
const submittedLogLabel = ref('')

const customerId = ref('')
const vehicleId = ref('')
const localPreviews = ref<{ id: string, url: string, file: File }[]>([])

const cameraPhotos = computed(() => localPreviews.value.map(p => ({ id: p.id, url: p.url })))
const previewPhoto = computed(() =>
  localPreviews.value.find(photo => photo.id === previewId.value) ?? null,
)
const previewIndex = computed(() =>
  localPreviews.value.findIndex(photo => photo.id === previewId.value),
)

const { data: customersData, pending: customersPending } = useClientFetch<{ items: CustomerPick[] }>(
  () => (phase.value === 'wizard' ? '/api/customers' : null),
  { query: { pageSize: 100, sort: 'name-asc' as const } },
)

const customerOptions = computed(() => customersData.value?.items ?? [])

const { data: vehiclesData, pending: vehiclesPending, refresh: refreshVehicles } = useClientFetch<{ items: VehiclePick[] }>(
  () => (phase.value === 'wizard' && customerId.value ? '/api/vehicles' : null),
  {
    query: computed(() => ({
      customerId: customerId.value || undefined,
      pageSize: 100,
      sort: 'tag-asc' as const,
    })),
  },
)

watch(customerId, () => {
  vehicleId.value = ''
  if (customerId.value) void refreshVehicles()
})

watch(wizardStep, (step) => {
  // Match invoice QR upload: open fullscreen camera as soon as photo step starts.
  if (step === 3 && phase.value === 'wizard') cameraOpen.value = true
})

const vehicleOptions = computed(() => vehiclesData.value?.items ?? [])

function loginHref(email?: string) {
  setStaffReturnPath(SERVICE_LOG_SHEET_UPLOAD_PATH, { autoContinue: true })
  const params = new URLSearchParams({ card: 'staff', redirect: SERVICE_LOG_SHEET_UPLOAD_PATH })
  if (email?.trim()) params.set('email', email.trim())
  return `/auth/login?${params.toString()}`
}

function goLogin(email?: string) {
  if (import.meta.client) window.location.assign(loginHref(email))
}

async function bootstrap() {
  bootError.value = ''
  phase.value = 'boot'
  try {
    if (!auth.loaded) await auth.fetchMe().catch(() => {})

    const ctx = await $fetch<{
      mode: ContextMode
      canUpload: boolean
      user: ContextUser | null
      suggestedUser: ContextUser | null
    }>('/api/public/service-log-sheet-upload/context')

    const auto = consumeStaffReturnAutoContinue()

    if (ctx.mode === 'signed_in' && ctx.user) {
      confirmName.value = ctx.user.name
      confirmEmail.value = ctx.user.email
      if (!ctx.canUpload) {
        bootError.value = 'Your account cannot upload service logs. Sign in with a mechanic or staff account that can.'
        phase.value = 'boot'
        return
      }
      if (auto) {
        phase.value = 'wizard'
        return
      }
      phase.value = 'confirm'
      return
    }

    if (ctx.mode === 'suggested' && ctx.suggestedUser) {
      confirmName.value = ctx.suggestedUser.name
      confirmEmail.value = ctx.suggestedUser.email
      phase.value = 'confirm'
      return
    }

    goLogin()
  }
  catch (e: unknown) {
    bootError.value = syncFetchErrorMessage(e, 'Could not start upload')
    phase.value = 'boot'
  }
}

function onConfirmYes() {
  if (auth.isSignedIn && !auth.isCustomer) {
    phase.value = 'wizard'
    return
  }
  goLogin(confirmEmail.value)
}

function onConfirmNo() {
  goLogin()
}

function onCaptured(file: File) {
  if (localPreviews.value.length >= SERVICE_LOG_MAX_PHOTOS) {
    actionError.value = 'Max 2 photos — front and back only.'
    return
  }
  actionError.value = ''
  localPreviews.value.push({
    id: crypto.randomUUID(),
    url: URL.createObjectURL(file),
    file,
  })
}

function removePreview(id: string) {
  const idx = localPreviews.value.findIndex(p => p.id === id)
  if (idx < 0) return
  URL.revokeObjectURL(localPreviews.value[idx]!.url)
  localPreviews.value.splice(idx, 1)
  if (previewId.value === id) previewId.value = null
}

function openPreview(id: string) {
  previewId.value = id
}

function goPhotoStep() {
  wizardStep.value = 3
  cameraOpen.value = true
}

function clearPreviews() {
  for (const p of localPreviews.value) URL.revokeObjectURL(p.url)
  localPreviews.value = []
}

async function submitLog() {
  if (!customerId.value || !vehicleId.value) {
    actionError.value = 'Pick a customer and vehicle first'
    return
  }
  if (!localPreviews.value.length) {
    actionError.value = 'Take at least one photo of the paper log'
    return
  }

  busy.value = true
  actionError.value = ''
  cameraOpen.value = false
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { log } = await $fetch<{ log: { id: string, logNumber: number } }>('/api/service-logs', {
      method: 'POST',
      body: {
        customerId: customerId.value,
        vehicleId: vehicleId.value,
        serviceDate: today,
        finalize: true,
      },
    })

    for (const preview of localPreviews.value) {
      const body = new FormData()
      body.append('file', preview.file, preview.file.name)
      body.append('ownerEntityType', 'service_log')
      body.append('ownerEntityId', log.id)
      body.append('fileKind', 'original')
      await $fetch('/api/files', { method: 'POST', body })
    }

    submittedLogLabel.value = logNumberDisplay(log.logNumber)
    phase.value = 'done'
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Could not submit service log')
  }
  finally {
    busy.value = false
  }
}

onMounted(() => { void bootstrap() })
onBeforeUnmount(() => { clearPreviews() })
</script>

<template>
  <div class="sl-sheet-upload">
    <header v-if="!cameraOpen" class="sl-sheet-upload__head">
      <strong>Service Log Upload</strong>
      <small>{{ BRAND_NAME }} SUITE</small>
    </header>

    <main v-show="!cameraOpen" class="sl-sheet-upload__main">
      <div v-if="phase === 'boot'" class="sl-sheet-upload__state">
        <p v-if="bootError">{{ bootError }}</p>
        <p v-else>Loading…</p>
        <button
          v-if="bootError"
          type="button"
          class="btn primary"
          style="margin-top:12px;"
          @click="bootstrap"
        >
          Try again
        </button>
      </div>

      <div v-else-if="phase === 'confirm'" class="sl-sheet-upload__confirm">
        <h1>Are you {{ confirmName }}?</h1>
        <p>
          This phone was used with <b>{{ confirmName }}</b> before.
          Confirm to upload a paper service log, or sign in as someone else.
        </p>
        <div class="sl-sheet-upload__actions">
          <button type="button" class="btn primary" @click="onConfirmYes">
            Yes — continue
          </button>
          <button type="button" class="btn" @click="onConfirmNo">
            No — sign in
          </button>
        </div>
      </div>

      <div v-else-if="phase === 'done'" class="sl-sheet-upload__success">
        <div class="inv-sl-success__burst" aria-hidden="true" />
        <div class="inv-sl-success__check" aria-hidden="true">✓</div>
        <h1>Service Log Uploaded</h1>
        <p>
          <b>{{ submittedLogLabel || 'Your log' }}</b> is in the review queue.
          You can close this page.
        </p>
      </div>

      <template v-else>
        <!-- Wizard: customer → vehicle → photos -->
        <div v-show="wizardStep === 1" class="sl-sheet-upload__panel">
          <h1>Which customer?</h1>
          <p class="sl-sheet-upload__hint">Select the account on the paper log.</p>
          <p v-if="customersPending" class="sl-sheet-upload__hint">Loading customers…</p>
          <div class="sl-sheet-upload__picks">
            <button
              v-for="c in customerOptions"
              :key="c.id"
              type="button"
              class="sl-sheet-upload__pick"
              :class="{ on: customerId === c.id }"
              @click="customerId = c.id"
            >
              <b>{{ c.displayName }}</b>
              <small>{{ c.accountKind === 'fleet' ? 'Fleet' : 'Individual' }}</small>
            </button>
          </div>
          <div class="sl-sheet-upload__actions">
            <button
              type="button"
              class="btn primary"
              :disabled="!customerId"
              @click="wizardStep = 2"
            >
              Continue
            </button>
          </div>
        </div>

        <div v-show="wizardStep === 2" class="sl-sheet-upload__panel">
          <h1>Which vehicle?</h1>
          <p class="sl-sheet-upload__hint">Pick the bus or unit from the paper log.</p>
          <p v-if="vehiclesPending" class="sl-sheet-upload__hint">Loading vehicles…</p>
          <div v-else-if="vehicleOptions.length" class="sl-sheet-upload__picks">
            <button
              v-for="v in vehicleOptions"
              :key="v.id"
              type="button"
              class="sl-sheet-upload__pick"
              :class="{ on: vehicleId === v.id }"
              @click="vehicleId = v.id"
            >
              <b>{{ vehicleTag(v) }}</b>
              <small>{{ vehicleSub(v) }}</small>
            </button>
          </div>
          <p v-else class="sl-sheet-upload__hint">No vehicles for this customer yet.</p>
          <div class="sl-sheet-upload__actions">
            <button type="button" class="btn" @click="wizardStep = 1">Back</button>
            <button
              type="button"
              class="btn primary"
              :disabled="!vehicleId"
              @click="goPhotoStep"
            >
              Continue
            </button>
          </div>
        </div>

        <div v-show="wizardStep === 3" class="sl-sheet-upload__panel">
          <h1>Upload Service Log</h1>
          <p class="sl-sheet-upload__hint">Front and back of the paper log — max 2 photos.</p>

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
            <span class="inv-sl-cam-launch__sub">Open camera for front &amp; back</span>
          </button>

          <div v-if="localPreviews.length" class="inv-sl-thumbs">
            <button
              v-for="(p, index) in localPreviews"
              :key="p.id"
              type="button"
              class="inv-sl-thumb"
              :aria-label="`View ${serviceLogPhotoSlotLabel(index).toLowerCase()} photo full size`"
              @click="openPreview(p.id)"
            >
              <img :src="p.url" :alt="`${serviceLogPhotoSlotLabel(index)} of service log`" draggable="false">
              <span class="inv-sl-thumb__label">{{ serviceLogPhotoSlotLabel(index) }}</span>
              <span
                class="inv-sl-thumb__x"
                role="button"
                tabindex="0"
                :aria-label="`Remove ${serviceLogPhotoSlotLabel(index).toLowerCase()} photo`"
                @click.stop="removePreview(p.id)"
                @keydown.enter.stop="removePreview(p.id)"
                @keydown.space.prevent.stop="removePreview(p.id)"
              >
                ×
              </span>
            </button>
          </div>

          <p v-if="localPreviews.length" class="sl-sheet-upload__count">
            {{ localPreviews.length }} of {{ SERVICE_LOG_MAX_PHOTOS }} photos ready
          </p>

          <p v-if="actionError" class="sl-sheet-upload__error">{{ actionError }}</p>

          <div class="sl-sheet-upload__actions">
            <button type="button" class="btn" :disabled="busy" @click="wizardStep = 2">Back</button>
            <button
              type="button"
              class="btn primary"
              :disabled="busy || !localPreviews.length"
              @click="submitLog"
            >
              {{ busy ? 'Uploading…' : 'Submit log' }}
            </button>
          </div>
        </div>
      </template>
    </main>

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

    <ServiceLogPhotoLightbox
      :open="Boolean(previewPhoto)"
      :url="previewPhoto?.url || ''"
      :label="previewIndex >= 0 ? serviceLogPhotoSlotLabel(previewIndex) : ''"
      :alt="previewIndex >= 0 ? `${serviceLogPhotoSlotLabel(previewIndex)} of service log` : 'Service log photo'"
      @close="previewId = null"
    />
  </div>
</template>

<style scoped>
.sl-sheet-upload {
  min-height: 100dvh;
  background: #f8fafc;
  color: #0f172a;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
}
.sl-sheet-upload__head {
  padding: 14px 16px;
  background: #0f172a;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sl-sheet-upload__head strong { font-size: 15px; }
.sl-sheet-upload__head small { opacity: 0.75; font-size: 12px; }
.sl-sheet-upload__main {
  flex: 1;
  padding: 20px 16px 32px;
  max-width: 520px;
  width: 100%;
  margin: 0 auto;
}
.sl-sheet-upload__state,
.sl-sheet-upload__confirm,
.sl-sheet-upload__success,
.sl-sheet-upload__panel {
  background: #fff;
  border-radius: 16px;
  padding: 20px 16px;
  box-shadow: 0 10px 30px -18px rgba(15, 23, 42, 0.35);
}
.sl-sheet-upload__confirm h1,
.sl-sheet-upload__success h1,
.sl-sheet-upload__panel h1 {
  margin: 0 0 8px;
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}
.sl-sheet-upload__confirm p,
.sl-sheet-upload__success p,
.sl-sheet-upload__hint {
  margin: 0 0 14px;
  color: #475569;
  font-size: 14px;
  line-height: 1.45;
}
.sl-sheet-upload__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.sl-sheet-upload__picks {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.sl-sheet-upload__pick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  padding: 12px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
}
.sl-sheet-upload__pick.on {
  border-color: #4f46e5;
  background: #eef2ff;
}
.sl-sheet-upload__pick b { font-size: 14px; }
.sl-sheet-upload__pick small { color: #64748b; font-size: 12px; }
.sl-sheet-upload__error {
  color: #dc2626;
  font-size: 13px;
  margin: 10px 0 0;
}
.sl-sheet-upload__count {
  margin: 10px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}
.sl-sheet-upload__success {
  text-align: center;
  position: relative;
  overflow: hidden;
}
</style>
