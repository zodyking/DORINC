import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { mailSettingsSchema } from '../../../shared/validators/printers'
import { engineJson, printApiError } from '../../services/printers'

/** Save email-to-print settings, or list the mailbox folders for the typed account. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const { load_folders: loadFolders, ...values } = await validateBody(event, mailSettingsSchema)
  try {
    if (loadFolders) {
      return await engineJson<{ ok: true, folders: string[] }>('/api/mail/folders', {
        method: 'POST',
        json: values,
        timeoutMs: 45_000,
      })
    }
    return await engineJson<{ ok: true, settings: Record<string, unknown> }>('/api/settings/mail', {
      method: 'PUT',
      json: values,
    })
  }
  catch (err) {
    throw printApiError(event, err, 'Could not save email settings')
  }
})
