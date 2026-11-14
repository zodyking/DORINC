import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { jobIdParamSchema } from '../../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.print.all')
  const params = validateParams(event, jobIdParamSchema)
  try {
    return await engineJson<{ ok: true }>(`/api/jobs/${params.id}/retry`, { method: 'POST', timeoutMs: 60_000 })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not retry the job')
  }
})
