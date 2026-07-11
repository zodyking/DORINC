<script setup lang="ts">
import { fetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  downloadPdfBlob,
  fetchInvoicePreviewPdf,
} from '~/utils/invoice-pdf'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  /** @deprecated Official PDFs are never shown in preview — live Blade only. Kept for call-site compat. */
  preferOfficial?: boolean
  hasOfficialPdf?: boolean
  canGeneratePdf?: boolean
  showDownload?: boolean
}>()

defineEmits<{ refreshed: [] }>()

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
    // Always render the current published Blade template so every invoice
    // preview looks the same. Official stored PDFs may be from an older
    // template era and are reserved for portal / email attachments.
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
    // Download matches the live Blade preview shown in this pane.
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

watch(() => [props.invoiceId], () => {
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
    <PdfViewer
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
