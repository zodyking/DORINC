import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { printerOptionsSchema, queueParamSchema } from '../../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const body = await validateBody(event, printerOptionsSchema)
  try {
    return await engineJson<{ ok: true }>(`/api/printers/${params.queue}/options`, {
      method: 'POST',
      json: body,
      timeoutMs: 60_000,
    })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not save driver settings')
  }
})
