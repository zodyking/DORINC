import { useDb } from '../../../db/client'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { jobIdParamSchema } from '../../../../shared/validators/printers'
import { deletePrinterJob, PrintError } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.print.all')
  const params = validateParams(event, jobIdParamSchema)
  try {
    const result = await deletePrinterJob(useDb(), params.id)
    return { ok: true, ...result }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not delete the job')
  }
})
