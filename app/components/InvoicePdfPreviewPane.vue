<script setup lang="ts">
import PdfViewer from '~/components/PdfViewer.client.vue'
import { fetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  downloadPdfBlob,
  fetchInvoiceOfficialPdf,
  fetchInvoicePreviewPdf,
  queueInvoicePdfGeneration,
} from '~/utils/invoice-pdf'

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
const { url: previewUrl, setFromBlob, revoke: revokePreview } = usePdfBlobUrl()

async function loadPreview() {
  if (!canUse.value) return
  busy.value = true
  error.value = ''
  revokePreview()
  try {
    if (props.preferOfficial && props.hasOfficialPdf) {
      try {
        setFromBlob(await fetchInvoiceOfficialPdf(props.invoiceId))
        return
      }
      catch {
        // Fall back to live Blade preview.
      }
    }
    setFromBlob(await fetchInvoicePreviewPdf(props.invoiceId))
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
        await queueInvoicePdfGeneration(props.invoiceId)
        emit('refreshed')
      }
      try {
        downloadPdfBlob(await fetchInvoiceOfficialPdf(props.invoiceId), `${props.invoiceLabel}.pdf`)
        return
      }
      catch {
        // Official file may still be rendering.
      }
    }
    downloadPdfBlob(await fetchInvoicePreviewPdf(props.invoiceId), `${props.invoiceLabel}.pdf`)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'PDF download failed')
  }
  finally {
    downloadBusy.value = false
  }
}

onMounted(() => {
  if (canUse.value) void loadPreview()
})

watch(() => [props.invoiceId, props.hasOfficialPdf, props.preferOfficial], () => {
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
    <div class="invoice-pdf-viewer-wrap">
      <PdfViewer
        :src="previewUrl"
        :title="`${invoiceLabel} PDF`"
        :show-download="showDownload !== false"
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
.invoice-pdf-viewer-wrap {
  min-height: min(78vh, 920px);
}
</style>
