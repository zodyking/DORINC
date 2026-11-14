import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { queueParamSchema, tailscaleActionSchema } from '../../../../../shared/validators/printers'
import { engineJson, printApiError } from '../../../../services/printers'

/** Join a saved printer to the tailnet as its own device, or remove that device. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const body = await validateBody(event, tailscaleActionSchema)
  try {
    return await engineJson<{ ok: true, pending: boolean }>(`/api/printers/${params.queue}/tailscale`, {
      method: 'POST',
      json: body,
      timeoutMs: 60_000,
    })
  }
  catch (err) {
    throw printApiError(event, err, 'Tailscale did not respond')
  }
})
