import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { addPrinterSchema } from '../../../shared/validators/printers'
import { engineJson, printApiError } from '../../services/printers'

/**
 * Start adding a printer. The engine joins Tailscale, reads the printer, and
 * installs a driver in the background; the page shows each step as it runs.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const body = await validateBody(event, addPrinterSchema)
  try {
    return await engineJson<{ ok: true, queue: string, label: string }>('/api/printers', {
      method: 'POST',
      json: { label: body.label, host: body.host, auth_key: body.authKey },
    })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not add the printer')
  }
})
