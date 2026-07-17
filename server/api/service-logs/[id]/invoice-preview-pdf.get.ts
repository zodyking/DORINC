import { setResponseHeader } from 'h3'
import { useDb } from '../../../db/client'
import {
  InvoicePdfServiceError,
  resolveInvoicePdfForDisplay,
} from '../../../services/invoice-pdf.service'
import { getServiceLog, ServiceLogsServiceError } from '../../../services/service-logs.service'
import { apiError } from '../../../utils/api-error'
import { throwPdfRenderApiError } from '../../../utils/pdf-api-error'
import { hasPermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import type { AuthContext } from '../../../utils/require-permission'

/** Invoice PDF preview for a service log the caller may read (includes mechanics on own logs). */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const log = await getServiceLog(db, id)

    const allowed = hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
    if (!allowed) throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this service log')

    if (!log.invoiceId) {
      throw apiError(event, 'NOT_FOUND', 'This service log is not linked to an invoice')
    }

    const { pdf, filename } = await resolveInvoicePdfForDisplay(db, log.invoiceId)

    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', `inline; filename="${filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return new Uint8Array(pdf)
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    if (err instanceof InvoicePdfServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    console.error('[service-log-invoice-preview-pdf]', id, err)
    throwPdfRenderApiError(event, err)
  }
})
