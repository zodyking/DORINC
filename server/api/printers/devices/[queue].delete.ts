import { useDb } from '../../../db/client'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { queueParamSchema } from '../../../../shared/validators/printers'
import { PrintError, removePrinter } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  try {
    await removePrinter(useDb(), params.queue)
    return { ok: true }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not remove printer')
  }
})
