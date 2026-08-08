import { useDb } from '../../../../../db/client'
import { apiError } from '../../../../../utils/api-error'
import { hasPermission } from '../../../../../utils/require-permission'
import type { AuthContext } from '../../../../../utils/require-permission'
import { canViewStaplesPrint } from '../../../../../utils/staples-print-access'
import {
  StaplesPrintMeServiceError,
  getStaplesPrintMePdf,
} from '../../../../../services/staples-printme.service'

/** Serve the PDF that was emailed to Staples PrintMe for this job. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  if (!canViewStaplesPrint(event)) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this PDF')
  }

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) throw apiError(event, 'VALIDATION_ERROR', 'Missing print job id')

  try {
    const pdf = await getStaplesPrintMePdf(useDb(), id, auth.user.id, {
      allowAdminAll: hasPermission(event, 'staples.read.all')
        || hasPermission(event, 'service_logs.read.all')
        || hasPermission(event, 'invoices.read.all')
        || hasPermission(event, 'system.admin.all'),
    })

    setHeader(event, 'Content-Type', pdf.contentType)
    setHeader(event, 'Content-Disposition', `inline; filename="${pdf.filename}"`)
    setHeader(event, 'Cache-Control', 'private, max-age=60')
    return pdf.body
  }
  catch (err) {
    if (err instanceof StaplesPrintMeServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'FORBIDDEN') throw apiError(event, 'FORBIDDEN', err.message)
      throw apiError(event, 'INTERNAL_ERROR', err.message)
    }
    throw err
  }
})
