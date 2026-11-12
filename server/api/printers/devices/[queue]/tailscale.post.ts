import { useDb } from '../../../../db/client'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { apiError } from '../../../../utils/api-error'
import { queueParamSchema, tailscaleActionSchema } from '../../../../../shared/validators/printers'
import { joinPrinterTailnet, leavePrinterTailnet, PrintError, TailscaleError } from '../../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const body = await validateBody(event, tailscaleActionSchema)
  try {
    if (body.action === 'leave') {
      await leavePrinterTailnet(useDb(), params.queue)
      return { ok: true }
    }
    const info = await joinPrinterTailnet(useDb(), params.queue, body.auth_key, body.hostname)
    return { ok: true, device: info }
  }
  catch (err) {
    if (err instanceof PrintError || err instanceof TailscaleError) {
      throw apiError(event, 'VALIDATION_ERROR', err.message)
    }
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Tailscale action failed')
  }
})
