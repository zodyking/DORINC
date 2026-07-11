<script setup lang="ts">
import { fetchErrorMessage } from '~/utils/fetch-blob-error'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  /** When true, Download stores/queues the official PDF for finalized invoices. */
  allowOfficialDownload?: boolean
  hasOfficialPdf?: boolean
  canGeneratePdf?: boolean
}>()

const emit = defineEmits<{
  refreshed: []
}>()

const open = ref(false)
const previewBusy = ref(false)
const downloadBusy = ref(false)
const error = ref('')
const previewUrl = ref('')

const canUse = computed(() => props.canGeneratePdf !== false)

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

async function fetchPreviewBlob() {
  return await $fetch<Blob>(`/api/invoices/${props.invoiceId}/preview-pdf`, {
    responseType: 'blob',
  })
}

async function openPreview() {
  if (!canUse.value) return
  open.value = true
  previewBusy.value = true
  error.value = ''
  revokePreview()
  try {
    const blob = await fetchPreviewBlob()
    previewUrl.value = URL.createObjectURL(blob)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'Could not render PDF preview')
  }
  finally {
    previewBusy.value = false
  }
}

async function downloadOfficialOrPreview() {
  if (!canUse.value) return
  downloadBusy.value = true
  error.value = ''
  try {
    if (props.allowOfficialDownload) {
      if (!props.hasOfficialPdf) {
        await $fetch(`/api/invoices/${props.invoiceId}/generate-pdf`, { method: 'POST' })
        emit('refreshed')
      }

      // Prefer stored official PDF; fall back to live preview if still generating.
      try {
        const blob = await $fetch<Blob>(`/api/invoices/${props.invoiceId}/pdf`, {
          responseType: 'blob',
        })
        triggerBrowserDownload(blob, `${props.invoiceLabel}.pdf`)
        return
      }
      catch {
        // Official file may still be rendering — use live DomPDF preview.
      }
    }

    const blob = await fetchPreviewBlob()
    triggerBrowserDownload(blob, `${props.invoiceLabel}.pdf`)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'PDF download failed')
    open.value = true
  }
  finally {
    downloadBusy.value = false
  }
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function close() {
  open.value = false
  error.value = ''
  revokePreview()
}

onUnmounted(() => {
  revokePreview()
})

defineExpose({
  openPreview,
  downloadOfficialOrPreview,
})
</script>

<template>
  <div class="invoice-pdf-actions">
    <button
      type="button"
      class="btn"
      :disabled="!canUse || previewBusy"
      :title="canUse ? 'Preview PDF via DomPDF' : 'Requires generate PDF permission'"
      @click="openPreview"
    >
      {{ previewBusy && open ? 'Rendering…' : 'Preview PDF' }}
    </button>
    <button
      type="button"
      class="btn"
      :disabled="!canUse || downloadBusy"
      :title="canUse ? (allowOfficialDownload ? 'Download PDF' : 'Download preview PDF') : 'Requires generate PDF permission'"
      @click="downloadOfficialOrPreview"
    >
      {{ downloadBusy ? 'Preparing…' : 'Download PDF' }}
    </button>
  </div>

  <div v-if="open" class="modal-scrim open" @click.self="close">
    <div class="card modal-card invoice-pdf-modal">
      <div class="chead">
        <h3>{{ invoiceLabel }}</h3>
        <div class="right">
          <button type="button" class="btn sm" @click="close">Close</button>
        </div>
      </div>
      <div class="cbody invoice-pdf-body">
        <p v-if="error" class="invoice-pdf-error">{{ error }}</p>
        <p v-else-if="previewBusy" class="invoice-pdf-empty">Rendering invoice PDF…</p>
        <ClientOnly v-else-if="previewUrl">
          <PdfViewer
            :src="previewUrl"
            :title="`${invoiceLabel} PDF`"
            @download="downloadOfficialOrPreview"
          />
        </ClientOnly>
      </div>
    </div>
  </div>
</template>

<style scoped>
.invoice-pdf-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
.invoice-pdf-modal {
  width: min(920px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
}
.invoice-pdf-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px !important;
}
.invoice-pdf-body :deep(.pdf-native-viewer) {
  min-height: 70vh;
}
.invoice-pdf-empty,
.invoice-pdf-error {
  margin: auto;
  text-align: center;
  font-size: 13px;
  color: #64748b;
  padding: 40px 16px;
}
.invoice-pdf-error {
  color: #dc2626;
}
</style>
