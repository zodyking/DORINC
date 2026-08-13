<script setup lang="ts">
/**
 * Printed service-log sheet QR landing.
 * Device cookie → “Are you …?” → login (with return) or simple upload wizard.
 */
import ServiceLogDocumentCamera from '~/components/service-logs/ServiceLogDocumentCamera.vue'
import ServiceLogPhotoLightbox from '~/components/service-logs/ServiceLogPhotoLightbox.vue'
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { setStaffReturnPath, consumeStaffReturnAutoContinue } from '~/utils/staff-return-path'
import { vehicleSub, vehicleTag } from '~/utils/vehicles-ui'
import {
  SERVICE_LOG_MAX_PHOTOS,
  serviceLogPhotoSlotLabel,
} from '#shared/service-log-photos'
import { SERVICE_LOG_SHEET_UPLOAD_PATH } from '#shared/service-log-sheet-upload'
import { logNumberDisplay } from '~/utils/service-logs-ui'

const SUCCESS_AUTO_CLOSE_SECONDS = 10

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
const confirmUserId = ref('')
const contextMode = ref<ContextMode | null>(null)
const confirmBusy = ref(false)
const wizardStep = ref(1)
const busy = ref(false)
const actionError = ref('')
const cameraOpen = ref(false)
const previewId = ref<string | null>(null)
const submittedLogLabel = ref('')
const submittedInvoiceLabel = ref('')
const closeCountdown = ref(SUCCESS_AUTO_CLOSE_SECONDS)
const closeAttempted = ref(false)
let closeTimer: ReturnType<typeof setInterval> | null = null

const customerId = ref('')
const vehicleId = ref('')
const localPreviews = ref<{ id: string, url: string, file: File }[]>([])
const customerContinueEl = ref<HTMLElement | null>(null)
const vehicleContinueEl = ref<HTMLElement | null>(null)

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
const isPickerStep = computed(() => phase.value === 'wizard' && (wizardStep.value === 1 || wizardStep.value === 2))

function scrollToContinue(el: HTMLElement | null) {
  if (!import.meta.client || !el) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'end',
    inline: 'nearest',
  })
}

function pickCustomer(id: string) {
  customerId.value = id
  void nextTick(() => scrollToContinue(customerContinueEl.value))
}

function pickVehicle(id: string) {
  vehicleId.value = id
  void nextTick(() => scrollToContinue(vehicleContinueEl.value))
}

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
      contextMode.value = 'signed_in'
      confirmName.value = ctx.user.name
      confirmEmail.value = ctx.user.email
      confirmUserId.value = ctx.user.id
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
      contextMode.value = 'suggested'
      confirmName.value = ctx.suggestedUser.name
      confirmEmail.value = ctx.suggestedUser.email
      confirmUserId.value = ctx.suggestedUser.id
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

async function onConfirmYes() {
  // Already signed in — trust context (don't re-gate on a stale client auth store).
  if (contextMode.value === 'signed_in') {
    phase.value = 'wizard'
    return
  }

  // Remembered device: mint a session for the confirmed staff user (no password).
  if (contextMode.value === 'suggested' && confirmUserId.value) {
    confirmBusy.value = true
    bootError.value = ''
    try {
      await $fetch('/api/public/service-log-sheet-upload/confirm', {
        method: 'POST',
        body: { userId: confirmUserId.value },
      })
      await auth.fetchMe().catch(() => {})
      if (!auth.isSignedIn || auth.isCustomer) {
        goLogin(confirmEmail.value)
        return
      }
      phase.value = 'wizard'
      return
    }
    catch (e: unknown) {
      // Fall back to normal sign-in with email prefilled.
      bootError.value = syncFetchErrorMessage(e, 'Could not continue — sign in to upload')
      goLogin(confirmEmail.value)
      return
    }
    finally {
      confirmBusy.value = false
    }
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

    // Same as UI “Send to invoice” — tech is ready when submitting from the sheet QR.
    const converted = await $fetch<{
      invoice: { invoiceNumber?: number }
    }>(`/api/service-logs/${log.id}/convert-to-invoice`, {
      method: 'POST',
      body: {},
    })

    submittedLogLabel.value = logNumberDisplay(log.logNumber)
    submittedInvoiceLabel.value = converted.invoice.invoiceNumber != null
      ? `INV-${String(converted.invoice.invoiceNumber).padStart(6, '0')}`
      : ''
    phase.value = 'done'
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Could not submit service log')
  }
  finally {
    busy.value = false
  }
}

function stopCloseCountdown() {
  if (closeTimer) {
    clearInterval(closeTimer)
    closeTimer = null
  }
}

function tryCloseWindow() {
  closeAttempted.value = true
  if (!import.meta.client) return
  try {
    window.close()
  }
  catch {
    // Browsers block closing tabs not opened by script — fallback copy handles this.
  }
}

function startCloseCountdown() {
  stopCloseCountdown()
  closeCountdown.value = SUCCESS_AUTO_CLOSE_SECONDS
  closeAttempted.value = false
  if (!import.meta.client) return
  closeTimer = setInterval(() => {
    closeCountdown.value -= 1
    if (closeCountdown.value <= 0) {
      stopCloseCountdown()
      tryCloseWindow()
    }
  }, 1000)
}

watch(phase, (next) => {
  if (next === 'done') startCloseCountdown()
  else stopCloseCountdown()
})

onMounted(() => { void bootstrap() })
onBeforeUnmount(() => {
  stopCloseCountdown()
  clearPreviews()
})
</script>

<template>
  <div class="sl-sheet-upload" :class="{ 'sl-sheet-upload--picker': isPickerStep && !cameraOpen }">
    <div class="sl-sheet-upload__wrap">
      <header v-if="!cameraOpen" class="sl-sheet-upload__brand">
        <img class="sl-sheet-upload__logo" :src="BRAND_ICON" alt="" width="40" height="40">
        <div class="sl-sheet-upload__brand-text">
          <b>{{ BRAND_NAME }}</b>
          <small>Service Log Upload</small>
        </div>
      </header>

      <main v-show="!cameraOpen" class="sl-sheet-upload__main">
        <div v-if="phase === 'boot'" class="sl-sheet-upload__card sl-sheet-upload__state">
          <p v-if="bootError" class="sl-sheet-upload__error">{{ bootError }}</p>
          <p v-else class="sl-sheet-upload__hint">Loading…</p>
          <button
            v-if="bootError"
            type="button"
            class="btn primary"
            @click="bootstrap"
          >
            Try again
          </button>
        </div>

        <div v-else-if="phase === 'confirm'" class="sl-sheet-upload__card sl-sheet-upload__confirm">
          <h1>Are you {{ confirmName }}?</h1>
          <p>
            This phone was used with <b>{{ confirmName }}</b> before.
            Confirm to upload a paper service log, or sign in as someone else.
          </p>
          <p v-if="bootError" class="sl-sheet-upload__error">{{ bootError }}</p>
          <div class="sl-sheet-upload__actions">
            <button
              type="button"
              class="btn primary"
              :disabled="confirmBusy"
              @click="onConfirmYes"
            >
              {{ confirmBusy ? 'Continuing…' : 'Yes — continue' }}
            </button>
            <button type="button" class="btn" :disabled="confirmBusy" @click="onConfirmNo">
              No — sign in
            </button>
          </div>
        </div>

        <div v-else-if="phase === 'done'" class="sl-sheet-upload__card sl-sheet-upload__success">
          <div class="inv-sl-success__burst" aria-hidden="true" />
          <div class="inv-sl-success__check" aria-hidden="true">✓</div>
          <h1>Successfully uploaded</h1>
          <p>
            <b>{{ submittedLogLabel || 'Your log' }}</b>
            <template v-if="submittedInvoiceLabel">
              is on <b>{{ submittedInvoiceLabel }}</b>.
            </template>
            <template v-else>
              was sent to invoice.
            </template>
          </p>
          <p
            class="sl-sheet-upload__close-hint"
            :aria-live="closeAttempted ? 'polite' : 'off'"
          >
            <template v-if="!closeAttempted">
              Closing this page in {{ closeCountdown }} second{{ closeCountdown === 1 ? '' : 's' }}…
            </template>
            <template v-else>
              You can close this tab.
            </template>
          </p>
        </div>

        <template v-else>
          <!-- Wizard: customer → vehicle → photos -->
          <div
            v-show="wizardStep === 1"
            class="sl-sheet-upload__card sl-sheet-upload__panel sl-sheet-upload__panel--picker"
          >
            <div class="sl-sheet-upload__panel-head">
              <h1>Which customer?</h1>
              <p class="sl-sheet-upload__hint">Select the account on the paper log.</p>
              <p v-if="customersPending" class="sl-sheet-upload__hint">Loading customers…</p>
            </div>
            <div class="sl-sheet-upload__picks">
              <button
                v-for="c in customerOptions"
                :key="c.id"
                type="button"
                class="sl-sheet-upload__pick"
                :class="{ on: customerId === c.id }"
                @click="pickCustomer(c.id)"
              >
                <b>{{ c.displayName }}</b>
              </button>
            </div>
            <div ref="customerContinueEl" class="sl-sheet-upload__actions">
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

          <div
            v-show="wizardStep === 2"
            class="sl-sheet-upload__card sl-sheet-upload__panel sl-sheet-upload__panel--picker"
          >
            <div class="sl-sheet-upload__panel-head">
              <h1>Which vehicle?</h1>
              <p class="sl-sheet-upload__hint">Pick the bus or unit from the paper log.</p>
              <p v-if="vehiclesPending" class="sl-sheet-upload__hint">Loading vehicles…</p>
              <p v-else-if="!vehicleOptions.length" class="sl-sheet-upload__hint">
                No vehicles for this customer yet.
              </p>
            </div>
            <div v-if="vehicleOptions.length" class="sl-sheet-upload__picks">
              <button
                v-for="v in vehicleOptions"
                :key="v.id"
                type="button"
                class="sl-sheet-upload__pick"
                :class="{ on: vehicleId === v.id }"
                @click="pickVehicle(v.id)"
              >
                <b>{{ vehicleTag(v) }}</b>
                <small>{{ vehicleSub(v) }}</small>
              </button>
            </div>
            <div ref="vehicleContinueEl" class="sl-sheet-upload__actions">
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

          <div v-show="wizardStep === 3" class="sl-sheet-upload__card sl-sheet-upload__panel">
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

      <footer v-if="!cameraOpen" class="suite-foot">
        © 2015 {{ BRAND_NAME }}. All rights reserved.
      </footer>
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
  display: flex;
  flex-direction: column;
  color: #0f172a;
  font-family: "Inter", system-ui, sans-serif;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.78) 0%, rgba(241, 245, 249, 0.88) 100%),
    url('/images/auth-login-bg.png') center / cover no-repeat fixed;
}
.sl-sheet-upload--picker {
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}
.sl-sheet-upload__wrap {
  width: min(520px, 100%);
  margin: 0 auto;
  padding: 16px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sl-sheet-upload--picker .sl-sheet-upload__wrap {
  height: 100%;
  padding-top: 12px;
}
.sl-sheet-upload__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.sl-sheet-upload--picker .sl-sheet-upload__brand {
  flex-direction: row;
  justify-content: center;
  gap: 10px;
  margin-bottom: 10px;
}
.sl-sheet-upload--picker .sl-sheet-upload__logo {
  width: 32px;
  height: 32px;
}
.sl-sheet-upload--picker .sl-sheet-upload__brand-text {
  text-align: left;
}
.sl-sheet-upload--picker .sl-sheet-upload__brand-text b {
  font-size: 15px;
}
.sl-sheet-upload__logo {
  width: 40px;
  height: 40px;
  display: block;
  object-fit: contain;
}
.sl-sheet-upload__brand-text b {
  display: block;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.sl-sheet-upload__brand-text small {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.3;
  font-weight: 600;
}
.sl-sheet-upload__main {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sl-sheet-upload__card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 22px 20px 24px;
  box-shadow: 0 16px 40px -16px rgba(15, 23, 42, 0.15);
}
.sl-sheet-upload__panel--picker {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 14px 14px;
}
.sl-sheet-upload__panel-head {
  flex-shrink: 0;
}
.sl-sheet-upload__panel-head .sl-sheet-upload__hint {
  margin-bottom: 10px;
}
.sl-sheet-upload__state {
  text-align: center;
}
.sl-sheet-upload__state .btn {
  margin-top: 12px;
}
.sl-sheet-upload__confirm h1,
.sl-sheet-upload__success h1,
.sl-sheet-upload__panel h1 {
  margin: 0 0 8px;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: #0f172a;
}
.sl-sheet-upload__confirm p,
.sl-sheet-upload__success p,
.sl-sheet-upload__hint {
  margin: 0 0 14px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}
.sl-sheet-upload__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  flex-shrink: 0;
  scroll-margin-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
.sl-sheet-upload__panel--picker .sl-sheet-upload__actions {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
  background: #fff;
}
.sl-sheet-upload__actions .btn.primary {
  flex: 1 1 auto;
  min-height: 48px;
}
.sl-sheet-upload__picks {
  display: grid;
  gap: 8px;
  margin-bottom: 0;
  flex: 1 1 auto;
  min-height: min(62dvh, 520px);
  max-height: none;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-right: 2px;
  align-content: start;
  grid-auto-rows: min-content;
}
.sl-sheet-upload__panel--picker .sl-sheet-upload__picks {
  min-height: 0;
}
.sl-sheet-upload__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
  padding: 12px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  color: inherit;
  font: inherit;
  cursor: pointer;
  min-height: 56px;
  height: auto;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.sl-sheet-upload__pick:hover {
  border-color: #c7d2fe;
  background: #fff;
}
.sl-sheet-upload__pick:focus-visible {
  outline: none;
  border-color: #a5b4fc;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
  background: #fff;
}
.sl-sheet-upload__pick.on {
  border-color: #4f46e5;
  background: #eef2ff;
  box-shadow: 0 0 0 1px rgba(79, 70, 229, 0.2);
}
.sl-sheet-upload__pick b {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}
.sl-sheet-upload__pick small {
  color: #64748b;
  font-size: 12px;
  line-height: 1.3;
}
.sl-sheet-upload__error {
  color: #dc2626;
  font-size: 13px;
  margin: 10px 0 0;
  font-weight: 600;
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
  padding-top: 28px;
  padding-bottom: 28px;
}
.sl-sheet-upload__close-hint {
  margin: 16px 0 0 !important;
  font-size: 12.5px !important;
  font-weight: 600;
  color: #4f46e5 !important;
}
.sl-sheet-upload .suite-foot {
  margin-top: 12px;
  padding: 6px 0 0;
  flex-shrink: 0;
}
.sl-sheet-upload--picker .suite-foot {
  margin-top: 8px;
  font-size: 10.5px;
}
</style>
