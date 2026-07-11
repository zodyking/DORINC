<script setup lang="ts">
import { fetchErrorMessage } from '~/utils/fetch-blob-error'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  preferOfficial?: boolean
  hasOfficialPdf?: boolean
  canGeneratePdf?: boolean
  showDownload?: boolean
}>()

const emit = defineEmits<{ refreshed: [] }>()

const auth = useAuthStore()
const canUse = computed(() => props.canGeneratePdf !== false && auth.can('invoices.generate_pdf.all'))

const busy = ref(false)
const downloadBusy = ref(false)
const error = ref('')
const previewUrl = ref('')

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

async function fetchOfficialBlob() {
  return await $fetch<Blob>(`/api/invoices/${props.invoiceId}/pdf`, {
    responseType: 'blob',
  })
}

async function loadPreview() {
  if (!canUse.value) return
  busy.value = true
  error.value = ''
  revokePreview()
  try {
    if (props.preferOfficial && props.hasOfficialPdf) {
      try {
        const blob = await fetchOfficialBlob()
        previewUrl.value = URL.createObjectURL(blob)
        return
      }
      catch {
        // Fall back to live preview.
      }
    }
    const blob = await fetchPreviewBlob()
    previewUrl.value = URL.createObjectURL(blob)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'Could not render PDF preview')
  }
  finally {
    busy.value = false
  }
}

async function downloadPdf() {
  if (!canUse.value) return
  downloadBusy.value = true
  error.value = ''
  try {
    if (props.preferOfficial) {
      if (!props.hasOfficialPdf) {
        await $fetch(`/api/invoices/${props.invoiceId}/generate-pdf`, { method: 'POST' })
        emit('refreshed')
      }
      try {
        const blob = await fetchOfficialBlob()
        triggerBrowserDownload(blob, `${props.invoiceLabel}.pdf`)
        return
      }
      catch {
        // Official file may still be rendering.
      }
    }
    const blob = await fetchPreviewBlob()
    triggerBrowserDownload(blob, `${props.invoiceLabel}.pdf`)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'PDF download failed')
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

onMounted(() => {
  if (canUse.value) void loadPreview()
})

watch(() => [props.invoiceId, props.hasOfficialPdf, props.preferOfficial], () => {
  if (canUse.value) void loadPreview()
})

onUnmounted(() => {
  revokePreview()
})

defineExpose({ refresh: loadPreview })
</script>

<template>
  <div v-if="!canUse" class="invoice-pdf-pane-empty">
    You do not have permission to preview invoice PDFs.
  </div>
  <div v-else-if="error" class="invoice-pdf-pane-empty invoice-pdf-pane-error">{{ error }}</div>
  <div v-else-if="busy && !previewUrl" class="invoice-pdf-pane-empty">Rendering PDF…</div>
  <ClientOnly v-else-if="previewUrl">
    <PdfViewer
      ref="viewerRef"
      :src="previewUrl"
      :title="`${invoiceLabel} PDF`"
      :show-download="showDownload !== false"
      @download="downloadPdf"
    />
    <template #fallback>
      <div class="invoice-pdf-pane-empty">Loading viewer…</div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.invoice-pdf-pane-empty {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: #64748b;
  padding: 48px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.invoice-pdf-pane-error {
  color: #dc2626;
}
</style>
