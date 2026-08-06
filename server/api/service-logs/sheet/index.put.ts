import { useDb } from '../../../db/client'
import { updateServiceLogSheetDocument } from '../../../services/service-log-sheet.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { serviceLogSheetSettingsSchema } from '../../../../shared/validators/workspace-settings'

/** Save the editable Letter service log sheet document. */
export default defineEventHandler(async (event) => {
  const auth = requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, serviceLogSheetSettingsSchema)
  const document = await updateServiceLogSheetDocument(useDb(), body, auth.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.service_log_sheet.update',
    afterData: {
      version: document.version,
      sectionCount: document.sections.length,
      itemCount: document.sections.reduce((n, s) => n + s.items.length, 0),
    },
    permissionKey: 'catalog.manage.all',
  })

  return { document }
})
