import { defineAsyncComponent } from 'vue'

/** Canvas + thumbnail strip (TripBuddy HistoryPdfJsViewer). */
export const PdfViewerCore = defineAsyncComponent(
  () => import('~/components/PdfViewer.client.vue'),
)

/** Title bar + zoom + download — use on every PDF surface. */
export const PdfViewerShell = defineAsyncComponent(
  () => import('~/components/PdfViewerShell.client.vue'),
)

/** Full-screen modal dialog wrapping PdfViewerShell. */
export const PdfViewerDialog = defineAsyncComponent(
  () => import('~/components/PdfViewerDialog.client.vue'),
)

/** @deprecated Use PdfViewerShell — kept as alias for existing imports. */
export const PdfViewer = PdfViewerShell
