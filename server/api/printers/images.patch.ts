import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { imageSettingsSchema } from '../../../shared/validators/printers'
import { engineJson, printApiError } from '../../services/printers'

/** Turn automatic product photos on or off, or look every printer up again. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const body = await validateBody(event, imageSettingsSchema)
  try {
    return await engineJson<{ ok: true, notice?: string }>('/api/settings/images', {
      method: 'PUT',
      json: body,
      timeoutMs: 60_000,
    })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not save picture settings')
  }
})
