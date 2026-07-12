import { fetchErrorMessage } from '~/utils/fetch-blob-error'
import {
  downloadPdfBlob,
  fetchInvoiceOfficialPdf,
  fetchInvoicePreviewPdf,
  queueInvoicePdfGeneration,
} from '~/utils/invoice-pdf'

export function useInvoicePdfDownload(options: {
  invoiceId: () => string
  invoiceLabel: () => string
  allowOfficialDownload?: () => boolean
  canGeneratePdf?: () => boolean
  onRefreshed?: () => void
}) {
  const busy = ref(false)
  const error = ref('')

  const canUse = computed(() => options.canGeneratePdf?.() !== false)

  async function download() {
    if (!canUse.value) return
    busy.value = true
    error.value = ''
    try {
      if (options.allowOfficialDownload?.()) {
        await queueInvoicePdfGeneration(options.invoiceId())
        options.onRefreshed?.()

        try {
          downloadPdfBlob(
            await fetchInvoiceOfficialPdf(options.invoiceId()),
            `${options.invoiceLabel()}.pdf`,
          )
          return
        }
        catch {
          // Official file may still be rendering — use live Blade preview.
        }
      }

      downloadPdfBlob(
        await fetchInvoicePreviewPdf(options.invoiceId()),
        `${options.invoiceLabel()}.pdf`,
      )
    }
    catch (e: unknown) {
      error.value = await fetchErrorMessage(e, 'PDF download failed')
    }
    finally {
      busy.value = false
    }
  }

  return { busy, error, canUse, download }
}
