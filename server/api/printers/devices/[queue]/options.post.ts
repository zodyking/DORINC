import { useDb } from '../../../../db/client'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { apiError } from '../../../../utils/api-error'
import { printerOptionsSchema, queueParamSchema } from '../../../../../shared/validators/printers'
import { applyQueueOptions, PrintError } from '../../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const body = await validateBody(event, printerOptionsSchema)
  try {
    const saved = await applyQueueOptions(useDb(), params.queue, body.options)
    return { ok: true, saved }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not save settings')
  }
})
