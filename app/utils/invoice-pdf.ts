import { assertPdfBlob } from '~/utils/fetch-blob-error'

/** URL for opening a live invoice PDF preview in a new browser tab. */
export function invoicePreviewPdfHref(invoiceId: string): string {
  return `/api/invoices/${invoiceId}/preview-pdf`
}

/** Scoped preview for invoices linked to a service log (mechanics + staff list). */
export function serviceLogInvoicePreviewPdfHref(serviceLogId: string): string {
  return `/api/service-logs/${serviceLogId}/invoice-preview-pdf`
}

export async function fetchInvoicePreviewPdf(invoiceId: string): Promise<Blob> {
  const blob = await $fetch<Blob>(`/api/invoices/${invoiceId}/preview-pdf`, {
    responseType: 'blob',
  })
  await assertPdfBlob(blob)
  return blob
}

export async function fetchInvoiceOfficialPdf(invoiceId: string): Promise<Blob> {
  const blob = await $fetch<Blob>(`/api/invoices/${invoiceId}/pdf`, {
    responseType: 'blob',
  })
  await assertPdfBlob(blob)
  return blob
}

export async function queueInvoicePdfGeneration(
  invoiceId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  await $fetch(`/api/invoices/${invoiceId}/generate-pdf`, {
    method: 'POST',
    body: options.force ? { force: true } : undefined,
  })
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
