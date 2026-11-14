import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { queueParamSchema } from '../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  try {
    return await engineJson<{ ok: true }>(`/api/printers/${params.queue}`, { method: 'DELETE', timeoutMs: 60_000 })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not remove the printer')
  }
})
