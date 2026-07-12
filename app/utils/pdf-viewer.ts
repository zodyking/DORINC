import { defineAsyncComponent } from 'vue'

/** PDF preview panel — native browser embed + optional download. */
export const PdfViewerShell = defineAsyncComponent(
  () => import('~/components/PdfViewerShell.client.vue'),
)

/** Full-screen modal with PDF preview. */
export const PdfViewerDialog = defineAsyncComponent(
  () => import('~/components/PdfViewerDialog.client.vue'),
)

/** @deprecated Use PdfViewerShell */
export const PdfViewer = PdfViewerShell
