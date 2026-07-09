import { getBackupSettings, updateBackupSettings } from '../../../../services/backups.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateBody } from '../../../../utils/validate'
import { backupSettingsPatchSchema } from '../../../../../shared/validators/backups'
import { writeAudit } from '../../../../services/audit.service'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'backups.manage.all')
  const body = await validateBody(event, backupSettingsPatchSchema)
  const before = await getBackupSettings(useDb())
  const updated = await updateBackupSettings(useDb(), body, user.id)

  await writeAudit(event, {
    entityType: 'backup',
    entityId: updated.id,
    action: 'backup.settings.updated',
    beforeData: before,
    afterData: updated,
    permissionKey: 'backups.manage.all',
    riskLevel: 'sensitive',
  })

  return updated
})
