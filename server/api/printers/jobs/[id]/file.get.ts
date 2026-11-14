import { setResponseHeader } from 'h3'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { jobIdParamSchema } from '../../../../../shared/validators/printers'
import { engineFile, printApiError } from '../../../../services/printers'

/** The PDF that was sent to the printer for this job. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.read.all')
  const params = validateParams(event, jobIdParamSchema)
  try {
    const doc = await engineFile(`/api/jobs/${params.id}/file`)
    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', `inline; filename="print-job-${params.id}.pdf"`)
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    return new Uint8Array(doc.data)
  }
  catch (err) {
    throw printApiError(event, err, 'Could not open the document')
  }
})
