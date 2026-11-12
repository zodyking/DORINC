import { useDb } from '../../db/client'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { apiError } from '../../utils/api-error'
import { mailSettingsSchema } from '../../../shared/validators/printers'
import { listMailFolders, PrintError, publicSettings, saveMailSettings } from '../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const body = await validateBody(event, mailSettingsSchema)
  try {
    if (body.load_folders) {
      const cfg = await saveMailSettings(useDb(), body)
      const folders = await listMailFolders(cfg)
      return { ok: true, settings: publicSettings(cfg), folders }
    }
    const settings = await saveMailSettings(useDb(), body)
    return { ok: true, settings: publicSettings(settings) }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'UPSTREAM_ERROR', err instanceof Error ? err.message : 'Could not save email settings')
  }
})
