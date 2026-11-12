import { useDb } from '../../../db/client'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { queueParamSchema, updatePrinterSchema } from '../../../../shared/validators/printers'
import { PrintError, updatePrinter } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const body = await validateBody(event, updatePrinterSchema)
  try {
    const identity = await updatePrinter(useDb(), params.queue, body.label, body.host, body.reread)
    return { ok: true, identity }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not update printer')
  }
})
