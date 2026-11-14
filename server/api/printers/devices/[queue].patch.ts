import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { queueParamSchema, updatePrinterSchema } from '../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const body = await validateBody(event, updatePrinterSchema)
  try {
    return await engineJson<{ ok: true, pending: boolean }>(`/api/printers/${params.queue}`, {
      method: 'PATCH',
      json: body,
    })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not update the printer')
  }
})
