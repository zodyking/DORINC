import { sendRedirect } from 'h3'

/** Legacy HTML print URL — redirect callers to the PDF preview endpoint. */
export default defineEventHandler(async (event) => {
  return sendRedirect(event, '/api/service-logs/sheet/preview-pdf', 302)
})
