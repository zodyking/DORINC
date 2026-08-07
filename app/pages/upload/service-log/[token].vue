<script setup lang="ts">
/**
 * Unauthenticated phone upload page opened from the invoice wizard QR code.
 * Must never rely on Nuxt path-prefix auto-imports — import capture UI explicitly.
 */
import ServiceLogDocumentCamera from '~/components/service-logs/ServiceLogDocumentCamera.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

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
const previews = ref<{ id: string, url: string }[]>([])
const galleryInputRef = ref<HTMLInputElement | null>(null)

async function loadSession() {
  loadError.value = ''
  try {
    const res = await $fetch<{ session: PublicSession }>(
      `/api/public/service-log-upload/${token.value}`,
    )
    session.value = res.session
    if (res.session.status === 'completed') done.value = true
  }
  catch (e: unknown) {
    loadError.value = syncFetchErrorMessage(e, 'This upload link is not available')
  }
}

async function uploadFile(file: File) {
  if (!file.type.startsWith('image/')) {
    actionError.value = 'Please choose a photo'
    return
  }
  busy.value = true
  actionError.value = ''
  try {
    const form = new FormData()
    form.append('file', file, file.name)
    await $fetch(`/api/public/service-log-upload/${token.value}/files`, {
      method: 'POST',
      body: form,
    })
    previews.value.push({ id: crypto.randomUUID(), url: URL.createObjectURL(file) })
    if (session.value) session.value.photoCount += 1
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Upload failed')
  }
  finally {
    busy.value = false
  }
}

function onGalleryPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const file of files) {
    void uploadFile(file)
  }
}

async function finish() {
  if (!session.value || session.value.photoCount < 1) {
    actionError.value = 'Take at least one photo first'
    return
  }
  busy.value = true
  actionError.value = ''
  try {
    const res = await $fetch<{
      ok: boolean
      invoiceNumberFormatted: string | null
    }>(`/api/public/service-log-upload/${token.value}/complete`, { method: 'POST' })
    done.value = true
    if (session.value) {
      session.value.status = 'completed'
      if (res.invoiceNumberFormatted) {
        session.value.invoiceNumberFormatted = res.invoiceNumberFormatted
      }
    }
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Could not finish upload')
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
    <header class="sl-public-upload__head">
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
        <h1>Photograph the Service Log</h1>
        <p class="sl-public-upload__meta">
          {{ session.customerName }} · {{ session.vehicleLabel }}
          · {{ session.technicianName }}
        </p>
        <p class="sl-public-upload__ai">
          Snap the paper log so AI can help fill invoice line items faster.
        </p>

        <ClientOnly>
          <ServiceLogDocumentCamera @captured="uploadFile" />
          <template #fallback>
            <p class="sl-public-upload__meta">Starting camera…</p>
          </template>
        </ClientOnly>

        <div class="sl-public-upload__alt">
          <button
            type="button"
            class="btn sl-public-upload__gallery"
            :disabled="busy"
            @click="galleryInputRef?.click()"
          >
            Choose from Gallery
          </button>
          <input
            ref="galleryInputRef"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            class="sl-public-upload__file"
            @change="onGalleryPick"
          >
        </div>

        <div v-if="previews.length" class="inv-sl-thumbs">
          <div v-for="p in previews" :key="p.id" class="inv-sl-thumb">
            <img :src="p.url" alt="Uploaded photo">
          </div>
        </div>

        <p v-if="previews.length" class="sl-public-upload__count">
          {{ previews.length }} photo{{ previews.length === 1 ? '' : 's' }} uploaded
        </p>

        <p v-if="actionError" class="sl-public-upload__error">{{ actionError }}</p>

        <button
          type="button"
          class="btn primary sl-public-upload__done"
          :disabled="busy || session.photoCount < 1"
          @click="finish"
        >
          {{ busy ? 'Working…' : 'Done — Attach to Invoice' }}
        </button>
      </template>
    </main>
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
.sl-public-upload__main h1 {
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
.sl-public-upload__alt {
  margin-top: 12px;
}
.sl-public-upload__gallery {
  width: 100%;
  min-height: 48px;
}
.sl-public-upload__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
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

/* Keep camera chrome usable even if global ledger CSS is delayed. */
:deep(.sl-doc-cam) { margin-top: 4px; }
:deep(.sl-doc-cam__stage) {
  position: relative;
  aspect-ratio: 3 / 4;
  max-height: min(58dvh, 520px);
  border-radius: 16px;
  overflow: hidden;
  background: #0f172a;
}
:deep(.sl-doc-cam__video) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
:deep(.sl-doc-cam__actions) {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
:deep(.sl-doc-cam__actions .btn) {
  flex: 1;
  min-height: 48px;
}
</style>
