<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({
  layout: false,
  ssr: false,
})

const route = useRoute()
const token = computed(() => String(route.params.token || ''))

useHead({
  title: 'Upload service log',
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

async function finish() {
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
      <strong>Service log upload</strong>
      <small v-if="session">{{ session.invoiceNumberFormatted || 'Invoice draft' }}</small>
    </header>

    <main class="sl-public-upload__main">
      <div v-if="loadError" class="sl-public-upload__state">
        <h1>Link unavailable</h1>
        <p>{{ loadError }}</p>
      </div>

      <div v-else-if="!session" class="sl-public-upload__state">
        <p>Loading…</p>
      </div>

      <div v-else-if="done" class="sl-public-upload__success">
        <div class="inv-sl-success__burst" aria-hidden="true" />
        <div class="inv-sl-success__check" aria-hidden="true">✓</div>
        <h1>Successfully attached</h1>
        <p>
          Photos are on
          <b>{{ session.invoiceNumberFormatted || 'the invoice' }}</b>.
          You can close this page.
        </p>
      </div>

      <template v-else>
        <h1>Photograph the service log</h1>
        <p class="help">
          {{ session.customerName }} · {{ session.vehicleLabel }}
          · Technician {{ session.technicianName }}
        </p>

        <ServiceLogDocumentCamera @captured="uploadFile" />

        <div v-if="previews.length" class="inv-sl-thumbs">
          <div v-for="p in previews" :key="p.id" class="inv-sl-thumb">
            <img :src="p.url" alt="Uploaded photo">
          </div>
        </div>

        <p v-if="actionError" class="help" style="color:#dc2626;">{{ actionError }}</p>

        <button
          type="button"
          class="btn primary sl-public-upload__done"
          :disabled="busy || session.photoCount < 1"
          @click="finish"
        >
          {{ busy ? 'Working…' : 'Done — attach to invoice' }}
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
  padding: 16px 18px 8px;
}
.sl-public-upload__head small { color: #64748b; }
.sl-public-upload__main {
  padding: 8px 18px 32px;
  max-width: 520px;
  margin: 0 auto;
}
.sl-public-upload__main h1 {
  font-size: 1.35rem;
  margin: 0 0 8px;
}
.sl-public-upload__state,
.sl-public-upload__success {
  text-align: center;
  padding: 48px 12px;
}
.sl-public-upload__done {
  width: 100%;
  margin-top: 16px;
  min-height: 48px;
}
</style>
