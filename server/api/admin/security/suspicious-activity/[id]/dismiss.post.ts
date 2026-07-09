import { dismissSuspiciousActivityAlert } from '../../../../../services/suspicious-activity.service'
import { writeAudit } from '../../../../../services/audit.service'
import { useDb } from '../../../../../db/client'
import { apiError } from '../../../../../utils/api-error'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateParams } from '../../../../../utils/validate'
import { idParamSchema } from '../../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  const alert = await dismissSuspiciousActivityAlert(db, id, user.id)
  if (!alert) throw apiError(event, 'NOT_FOUND', 'Alert not found or already dismissed')

  await writeAudit(event, {
    entityType: 'security_alert',
    entityId: id,
    action: 'security.alert.dismiss',
    afterData: { ruleKey: alert.ruleKey },
    permissionKey: 'system.admin.all',
    riskLevel: 'sensitive',
  })

  return { ok: true, id: alert.id, status: alert.status }
})
