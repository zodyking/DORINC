import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { queueParamSchema } from '../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../services/printers'

/** Clear the notice left by a printer that could not be added. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  try {
    return await engineJson<{ ok: true }>(`/api/setups/${params.queue}`, { method: 'DELETE' })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not clear that notice')
  }
})
