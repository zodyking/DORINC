import { useDb } from '../../../db/client'
import { saveQuoSettings } from '../../../services/quo.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { quoSettingsPatchSchema } from '../../../../shared/validators/quo'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, quoSettingsPatchSchema)
  const db = useDb()
  const view = await saveQuoSettings(db, body, actor.id)

  await writeAudit(event, {
    entityType: 'app_settings',
    entityId: 'quo.config',
    action: 'quo.settings.saved',
    afterData: {
      enabled: view.enabled,
      hasApiKey: view.hasApiKey,
      fromNumber: view.fromNumber,
      configured: view.configured,
      paymentDate: view.paymentDate,
      paymentAmountUsd: view.paymentAmountUsd,
      hasPortalUsername: view.hasPortalUsername,
      hasPortalPassword: view.hasPortalPassword,
    },
    permissionKey: 'system.admin.all',
    riskLevel: 'sensitive',
  })

  return view
})
