import { useDb } from '../../../db/client'
import { resetServiceLogSheetDocument } from '../../../services/service-log-sheet.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'

/** Restore the default Letter service catalog template. */
export default defineEventHandler(async (event) => {
  const auth = requirePermission(event, 'catalog.manage.all')
  const document = await resetServiceLogSheetDocument(useDb(), auth.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.service_log_sheet.reset',
    afterData: {
      version: document.version,
      sectionCount: document.sections.length,
    },
    permissionKey: 'catalog.manage.all',
  })

  return { document }
})
