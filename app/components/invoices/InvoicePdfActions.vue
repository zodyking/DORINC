<script setup lang="ts">
import { PdfViewerDialog } from '~/utils/pdf-viewer'
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
  /** When true, Download stores/queues the official PDF for finalized invoices. */
  allowOfficialDownload?: boolean
  canGeneratePdf?: boolean
}>()

const emit = defineEmits<{
  refreshed: []
}>()

const dialogOpen = ref(false)
const previewBusy = ref(false)
const downloadBusy = ref(false)
const error = ref('')
const previewBlob = ref<Blob | null>(null)
const { url: previewUrl, setFromBlob, revoke: revokePreview } = usePdfBlobUrl()

const canUse = computed(() => props.canGeneratePdf !== false)

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
  if (!canUse.value) return
  downloadBusy.value = true
  error.value = ''
  try {
    if (props.allowOfficialDownload) {
      await queueInvoicePdfGeneration(props.invoiceId)
      emit('refreshed')

      try {
        downloadPdfBlob(
          await fetchInvoiceOfficialPdf(props.invoiceId),
          `${props.invoiceLabel}.pdf`,
        )
        return
      }
      catch {
        // Official file may still be rendering — use live Blade preview.
      }
    }

    downloadPdfBlob(
      await fetchInvoicePreviewPdf(props.invoiceId),
      `${props.invoiceLabel}.pdf`,
    )
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'PDF download failed')
    dialogOpen.value = true
  }
  finally {
    downloadBusy.value = false
  }
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
  <div class="invoice-pdf-actions">
    <button
      type="button"
      class="btn"
      :disabled="!canUse || previewBusy"
      :title="canUse ? 'Preview PDF (Laravel Blade)' : 'Requires generate PDF permission'"
      @click="openPreview"
    >
      {{ previewBusy ? 'Rendering…' : 'Preview PDF' }}
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
    <p v-if="error && !dialogOpen" class="invoice-pdf-actions-error">{{ error }}</p>
  </div>

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
.invoice-pdf-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.invoice-pdf-actions-error {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: #dc2626;
}
</style>
