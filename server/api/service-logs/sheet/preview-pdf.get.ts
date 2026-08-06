import { useDb } from '../../../db/client'
import { renderServiceLogSheetPdf } from '../../../services/service-log-sheet.service'
import { apiError } from '../../../utils/api-error'
import { throwPdfRenderApiError } from '../../../utils/pdf-api-error'
import { hasPermission } from '../../../utils/require-permission'
import type { AuthContext } from '../../../utils/require-permission'

/** Sync Letter service log sheet PDF for in-app preview. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const allowed = hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')

  if (!allowed) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to print the service log sheet')
  }

  try {
    const pdf = await renderServiceLogSheetPdf(useDb())
    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', 'inline; filename="service-log-sheet.pdf"')
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return pdf
  }
  catch (err) {
    throwPdfRenderApiError(event, err)
  }
})
