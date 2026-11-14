import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { queueParamSchema } from '../../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../../services/printers'

/** Read a saved printer again and reinstall its driver. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  try {
    return await engineJson<{ ok: true, pending: boolean }>(`/api/printers/${params.queue}/setup`, { method: 'POST' })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not read the printer again')
  }
})
