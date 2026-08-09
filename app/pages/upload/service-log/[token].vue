<script setup lang="ts">
/**
 * Unauthenticated phone upload page opened from the invoice wizard QR code.
 * In-app camera only — front & back (max 2), with remove before attach.
 */
import ServiceLogDocumentCamera from '~/components/service-logs/ServiceLogDocumentCamera.vue'
import ServiceLogPhotoLightbox from '~/components/service-logs/ServiceLogPhotoLightbox.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  SERVICE_LOG_MAX_PHOTOS,
  serviceLogPhotoSlotLabel,
} from '#shared/service-log-photos'

definePageMeta({
  layout: false,
  ssr: false,
})

const route = useRoute()
const token = computed(() => String(route.params.token || ''))

useHead({
  title: 'Upload Service Log',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
  ],
})

interface PublicSession {
  id: string
  status: string
  customerName: string
  vehicleLabel: string
  technicianName: string
  invoiceNumberFormatted: string | null
  photoCount: number
  expiresAt: string
}

const session = ref<PublicSession | null>(null)
const loadError = ref('')
const busy = ref(false)
const actionError = ref('')
const done = ref(false)
const previews = ref<{ id: string, url: string, file: File }[]>([])
const cameraOpen = ref(true)
const previewId = ref<string | null>(null)

const cameraPhotos = computed(() => previews.value.map(p => ({ id: p.id, url: p.url })))
const previewPhoto = computed(() =>
  previews.value.find(photo => photo.id === previewId.value) ?? null,
)
const previewIndex = computed(() =>
  previews.value.findIndex(photo => photo.id === previewId.value),
)

async function loadSession() {
  loadError.value = ''
  try {
    const res = await $fetch<{ session: PublicSession }>(
      `/api/public/service-log-upload/${token.value}`,
    )
    session.value = res.session
    if (res.session.status === 'completed') {
      done.value = true
      cameraOpen.value = false
    }
  }
  catch (e: unknown) {
    loadError.value = syncFetchErrorMessage(e, 'This upload link is not available')
    cameraOpen.value = false
  }
}

function onCaptured(file: File) {
  if (!file.type.startsWith('image/')) {
    actionError.value = 'Please take a photo'
    return
  }
  if (previews.value.length >= SERVICE_LOG_MAX_PHOTOS) {
    actionError.value = 'Max 2 photos — front and back only. Remove one to retake.'
    return
  }
  actionError.value = ''
  previews.value.push({
    id: crypto.randomUUID(),
    url: URL.createObjectURL(file),
    file,
  })
}

function removePreview(id: string) {
  const idx = previews.value.findIndex(p => p.id === id)
  if (idx < 0) return
  URL.revokeObjectURL(previews.value[idx]!.url)
  previews.value.splice(idx, 1)
  if (previewId.value === id) previewId.value = null
  actionError.value = ''
}

function openPreview(id: string) {
  previewId.value = id
}

async function finish() {
  if (!session.value || previews.value.length < 1) {
    actionError.value = 'Take at least one photo first'
    return
  }
  busy.value = true
  actionError.value = ''
  cameraOpen.value = false
  try {
    for (const preview of previews.value) {
      const form = new FormData()
      form.append('file', preview.file, preview.file.name)
      await $fetch(`/api/public/service-log-upload/${token.value}/files`, {
        method: 'POST',
        body: form,
      })
    }

    const res = await $fetch<{
      ok: boolean
      invoiceNumberFormatted: string | null
    }>(`/api/public/service-log-upload/${token.value}/complete`, { method: 'POST' })
    done.value = true
    if (session.value) {
      session.value.status = 'completed'
      session.value.photoCount = previews.value.length
      if (res.invoiceNumberFormatted) {
        session.value.invoiceNumberFormatted = res.invoiceNumberFormatted
      }
    }
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Could not finish upload')
    cameraOpen.value = true
  }
  finally {
    busy.value = false
  }
}

onMounted(() => { void loadSession() })
onBeforeUnmount(() => {
  for (const p of previews.value) URL.revokeObjectURL(p.url)
})
</script>

<template>
  <div class="sl-public-upload">
    <header v-if="!cameraOpen || done || loadError || !session" class="sl-public-upload__head">
      <strong>Service Log Upload</strong>
      <small v-if="session">{{ session.invoiceNumberFormatted || 'Invoice Draft' }}</small>
    </header>

    <main class="sl-public-upload__main">
      <div v-if="loadError" class="sl-public-upload__state">
        <h1>Link Unavailable</h1>
        <p>{{ loadError }}</p>
      </div>

      <div v-else-if="!session" class="sl-public-upload__state">
        <p>Loading…</p>
      </div>

      <div v-else-if="done" class="sl-public-upload__success">
        <div class="inv-sl-success__burst" aria-hidden="true" />
        <div class="inv-sl-success__check" aria-hidden="true">✓</div>
        <h1>Service Log Attached</h1>
        <p>
          Photos are on
          <b>{{ session.invoiceNumberFormatted || 'the invoice' }}</b>.
          AI can extract line items next — you can close this page.
        </p>
      </div>

      <template v-else>
        <div v-if="!cameraOpen" class="sl-public-upload__review">
          <h1>Upload Service Log</h1>
          <p class="sl-public-upload__meta">
            {{ session.customerName }} · {{ session.vehicleLabel }}
            · {{ session.technicianName }}
          </p>
          <p class="sl-public-upload__ai">
            Front and back of the paper log — max 2 photos.
          </p>

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
              {{ previews.length ? 'Retake Photos' : 'Take Photos' }}
            </span>
            <span class="inv-sl-cam-launch__sub">Open camera for front &amp; back</span>
          </button>

          <div v-if="previews.length" class="inv-sl-thumbs">
            <button
              v-for="(p, index) in previews"
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

          <p v-if="previews.length" class="sl-public-upload__count">
            {{ previews.length }} of {{ SERVICE_LOG_MAX_PHOTOS }} photos ready
          </p>

          <p v-if="actionError" class="sl-public-upload__error">{{ actionError }}</p>

          <button
            type="button"
            class="btn primary sl-public-upload__done"
            :disabled="busy || previews.length < 1"
            @click="finish"
          >
            {{ busy ? 'Working…' : 'Done — Attach to Invoice' }}
          </button>
        </div>
      </template>
    </main>

    <ClientOnly>
      <ServiceLogDocumentCamera
        v-if="session && !done && !loadError"
        mode="fullscreen"
        :open="cameraOpen"
        :photos="cameraPhotos"
        @captured="onCaptured"
        @remove="removePreview"
        @done="finish"
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
.sl-public-upload {
  min-height: 100dvh;
  background:
    radial-gradient(120% 80% at 50% -10%, #dbeafe 0%, transparent 55%),
    linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  color: #0f172a;
  font-family: "Segoe UI", "Avenir Next", "Helvetica Neue", sans-serif;
}
.sl-public-upload__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 16px 18px 8px;
}
.sl-public-upload__head small { color: #64748b; font-weight: 600; }
.sl-public-upload__main {
  padding: 8px 18px 32px;
  max-width: 520px;
  margin: 0 auto;
}
.sl-public-upload__main h1,
.sl-public-upload__review h1 {
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  line-height: 1.2;
}
.sl-public-upload__meta {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.4;
}
.sl-public-upload__ai {
  margin: 8px 0 14px;
  font-size: 14px;
  color: #334155;
  line-height: 1.45;
}
.sl-public-upload__state,
.sl-public-upload__success {
  text-align: center;
  padding: 48px 12px;
}
.sl-public-upload__count {
  margin: 10px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}
.sl-public-upload__error {
  margin: 10px 0 0;
  font-size: 13px;
  color: #dc2626;
}
.sl-public-upload__done {
  width: 100%;
  margin-top: 16px;
  min-height: 48px;
}
</style>
