/** Client helpers for invoice PDF preview, download, and generation. */

export async function fetchInvoicePreviewPdf(invoiceId: string): Promise<Blob> {
  return await $fetch<Blob>(`/api/invoices/${invoiceId}/preview-pdf`, {
    responseType: 'blob',
  })
}

export async function fetchInvoiceOfficialPdf(invoiceId: string): Promise<Blob> {
  return await $fetch<Blob>(`/api/invoices/${invoiceId}/pdf`, {
    responseType: 'blob',
  })
}

export async function queueInvoicePdfGeneration(invoiceId: string): Promise<void> {
  await $fetch(`/api/invoices/${invoiceId}/generate-pdf`, { method: 'POST' })
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
