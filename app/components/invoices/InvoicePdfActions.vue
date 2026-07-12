<script setup lang="ts">
import { PdfViewerDialog } from '~/utils/pdf-viewer'
import { fetchErrorMessage } from '~/utils/fetch-blob-error'
import { fetchInvoicePreviewPdf } from '~/utils/invoice-pdf'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  allowOfficialDownload?: boolean
  canGeneratePdf?: boolean
  showPreviewButton?: boolean
  showDownloadButton?: boolean
}>()

const emit = defineEmits<{
  refreshed: []
}>()

const dialogOpen = ref(false)
const previewBusy = ref(false)
const previewBlob = ref<Blob | null>(null)
const { url: previewUrl, setFromBlob, revoke: revokePreview } = usePdfBlobUrl()

const { busy: downloadBusy, error, canUse, download } = useInvoicePdfDownload({
  invoiceId: () => props.invoiceId,
  invoiceLabel: () => props.invoiceLabel,
  allowOfficialDownload: () => props.allowOfficialDownload === true,
  canGeneratePdf: () => props.canGeneratePdf,
  onRefreshed: () => emit('refreshed'),
})

async function openPreview() {
  if (!canUse.value) return
  previewBusy.value = true
  error.value = ''
  revokePreview()
  previewBlob.value = null
  try {
    const blob = await fetchInvoicePreviewPdf(props.invoiceId)
    previewBlob.value = blob
    setFromBlob(blob)
    dialogOpen.value = true
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'Could not render PDF preview')
  }
  finally {
    previewBusy.value = false
  }
}

async function downloadOfficialOrPreview() {
  await download()
  if (error.value) dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  error.value = ''
  previewBlob.value = null
  revokePreview()
}

defineExpose({
  openPreview,
  downloadOfficialOrPreview,
})
</script>

<template>
  <button
    v-if="showPreviewButton !== false"
    type="button"
    class="btn"
    :disabled="!canUse || previewBusy"
    :title="canUse ? 'Preview PDF (Laravel Blade)' : 'Requires generate PDF permission'"
    @click="openPreview"
  >
    {{ previewBusy ? 'Rendering…' : 'Preview PDF' }}
  </button>
  <button
    v-if="showDownloadButton !== false"
    type="button"
    class="btn"
    :disabled="!canUse || downloadBusy"
    :title="canUse ? (allowOfficialDownload ? 'Download PDF' : 'Download preview PDF') : 'Requires generate PDF permission'"
    @click="downloadOfficialOrPreview"
  >
    {{ downloadBusy ? 'Preparing…' : 'Download' }}
  </button>
  <p v-if="error && !dialogOpen" class="invoice-pdf-actions-error">{{ error }}</p>

  <PdfViewerDialog
    v-model:open="dialogOpen"
    :src="previewUrl"
    :blob="previewBlob"
    :title="`${invoiceLabel} PDF`"
    :download-href="previewUrl || undefined"
    :download-filename="`${invoiceLabel}.pdf`"
    @close="closeDialog"
    @download="downloadOfficialOrPreview"
  />
</template>

<style scoped>
.invoice-pdf-actions-error {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: #dc2626;
}
</style>
