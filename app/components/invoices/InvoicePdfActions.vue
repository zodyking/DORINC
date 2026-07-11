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
  /** When true, Download stores/queues the official PDF for finalized invoices. */
  allowOfficialDownload?: boolean
  canGeneratePdf?: boolean
}>()

const emit = defineEmits<{
  refreshed: []
}>()

const open = ref(false)
const previewBusy = ref(false)
const downloadBusy = ref(false)
const error = ref('')
const { url: previewUrl, setFromBlob, revoke: revokePreview } = usePdfBlobUrl()

const canUse = computed(() => props.canGeneratePdf !== false)

async function openPreview() {
  if (!canUse.value) return
  open.value = true
  previewBusy.value = true
  error.value = ''
  revokePreview()
  try {
    setFromBlob(await fetchInvoicePreviewPdf(props.invoiceId))
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
      // Refresh official PDF when missing or built on a stale template version.
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
    open.value = true
  }
  finally {
    downloadBusy.value = false
  }
}

function close() {
  open.value = false
  error.value = ''
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
.invoice-pdf-body :deep(.pdf-acrobat) {
  flex: 1;
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
