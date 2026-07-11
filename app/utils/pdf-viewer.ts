import { defineAsyncComponent } from 'vue'

/**
 * App-wide PDF.js viewer — async import this everywhere so viewer updates
 * apply on every page (invoice tab, preview modal, template designer).
 */
export const PdfViewer = defineAsyncComponent(
  () => import('~/components/PdfViewer.client.vue'),
)
