import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { jobIdParamSchema } from '../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../services/printers'

/** Remove a job from print history, with the copy kept for the printer. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.print.all')
  const params = validateParams(event, jobIdParamSchema)
  try {
    return await engineJson<{ ok: true }>(`/api/jobs/${params.id}`, { method: 'DELETE' })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not delete the job')
  }
})
