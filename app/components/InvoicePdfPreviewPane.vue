<script setup lang="ts">
import { PdfViewerShell } from '~/utils/pdf-viewer'
import { fetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  downloadPdfBlob,
  fetchInvoicePreviewPdf,
} from '~/utils/invoice-pdf'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  canGeneratePdf?: boolean
  showDownload?: boolean
}>()

const auth = useAuthStore()
const canUse = computed(() => props.canGeneratePdf !== false && auth.can('invoices.generate_pdf.all'))

const busy = ref(false)
const error = ref('')
const previewBlob = ref<Blob | null>(null)
const { url: previewUrl, setFromBlob, revoke: revokePreview } = usePdfBlobUrl()

async function loadPreview() {
  if (!canUse.value) return
  busy.value = true
  error.value = ''
  revokePreview()
  previewBlob.value = null
  try {
    const blob = await fetchInvoicePreviewPdf(props.invoiceId)
    previewBlob.value = blob
    setFromBlob(blob)
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
  error.value = ''
  try {
    downloadPdfBlob(await fetchInvoicePreviewPdf(props.invoiceId), `${props.invoiceLabel}.pdf`)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'PDF download failed')
  }
}

onMounted(() => {
  if (canUse.value) void loadPreview()
})

watch(() => props.invoiceId, () => {
  if (canUse.value) void loadPreview()
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
    <div class="invoice-pdf-pane">
      <PdfViewerShell
        fill
        compact
        :src="previewUrl"
        :blob="previewBlob"
        :title="`${invoiceLabel} PDF`"
        :show-download="showDownload !== false"
        :download-href="previewUrl"
        :download-filename="`${invoiceLabel}.pdf`"
        @download="downloadPdf"
      />
    </div>
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
.invoice-pdf-pane {
  min-height: min(62vh, 720px);
  display: flex;
  flex-direction: column;
}

.invoice-pdf-pane :deep(.pdf-shell) {
  flex: 1;
  min-height: 0;
}

@media (max-width: 640px) {
  .invoice-pdf-pane {
    min-height: 0;
    height: min(50dvh, 440px);
    max-height: min(50dvh, 440px);
    display: flex;
    flex-direction: column;
  }

  .invoice-pdf-pane :deep(.pdf-shell) {
    border-radius: 10px;
    flex: 1;
    min-height: 0;
    height: 100%;
  }

  .invoice-pdf-pane :deep(.pdf-shell__frame) {
    flex: 1;
    min-height: 0;
  }
}
</style>
