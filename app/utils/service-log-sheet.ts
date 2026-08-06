import { assertPdfBlob } from '~/utils/fetch-blob-error'

export function serviceLogSheetPreviewPdfHref(): string {
  return '/api/service-logs/sheet/preview-pdf'
}

/** Fetch the blank Letter service log sheet as a PDF blob. */
export async function fetchServiceLogSheetPdf(): Promise<Blob> {
  const blob = await $fetch<Blob>(serviceLogSheetPreviewPdfHref(), {
    responseType: 'blob',
  })
  await assertPdfBlob(blob)
  return blob
}
