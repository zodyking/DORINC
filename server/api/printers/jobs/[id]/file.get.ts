import { setResponseHeader } from 'h3'
import { useDb } from '../../../../db/client'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { apiError } from '../../../../utils/api-error'
import { jobIdParamSchema } from '../../../../../shared/validators/printers'
import { jobDocument } from '../../../../services/printers'

/** The PDF that was sent to the printer for this job. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.read.all')
  const params = validateParams(event, jobIdParamSchema)
  const doc = await jobDocument(useDb(), params.id)
  if (!doc) throw apiError(event, 'NOT_FOUND', 'The document for this job is no longer stored')
  const safe = doc.filename.replace(/["\\\r\n]/g, '_')
  setResponseHeader(event, 'Content-Type', 'application/pdf')
  setResponseHeader(event, 'Content-Disposition', `inline; filename="${safe}"`)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  return new Uint8Array(doc.data)
})
