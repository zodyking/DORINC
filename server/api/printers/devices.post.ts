import { useDb } from '../../db/client'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { apiError } from '../../utils/api-error'
import { addPrinterSchema } from '../../../shared/validators/printers'
import { addPrinter, PrintError, TailscaleError } from '../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const body = await validateBody(event, addPrinterSchema)
  try {
    const result = await addPrinter(useDb(), {
      label: body.label,
      queue: body.queue,
      host: body.host,
      authKey: body.authKey,
      tailHostname: body.tailHostname,
    })
    return { ok: true, identity: result.identity, warning: result.warning }
  }
  catch (err) {
    if (err instanceof PrintError || err instanceof TailscaleError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not add printer')
  }
})
