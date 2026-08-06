import { useDb } from '../../../db/client'
import { updateServiceLogSheetSettings } from '../../../services/service-log-sheet.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { serviceLogSheetSettingsSchema } from '../../../../shared/validators/workspace-settings'

/** Save which catalog items appear on the printable service log sheet. */
export default defineEventHandler(async (event) => {
  const auth = requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, serviceLogSheetSettingsSchema)
  const settings = await updateServiceLogSheetSettings(useDb(), body, auth.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.service_log_sheet.update',
    afterData: {
      mode: settings.mode,
      itemCount: settings.itemIds.length,
    },
    permissionKey: 'catalog.manage.all',
  })

  return { settings }
})
