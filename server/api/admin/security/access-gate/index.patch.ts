import { useDb } from '../../../../db/client'
import { saveAccessGateSettings } from '../../../../services/access-gate.service'
import { writeAudit } from '../../../../services/audit.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { accessGateSettingsSchema } from '../../../../../shared/validators/access-gate'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, accessGateSettingsSchema)
  const settings = await saveAccessGateSettings(useDb(), body, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.access_gate.update',
    afterData: {
      enabled: settings.enabled,
      blockMode: settings.blockMode,
      redirectUrl: settings.redirectUrl,
      bannedIpCount: settings.bannedIps.length,
      polygonPoints: settings.allowedPolygon.length,
    },
    riskLevel: 'high',
    permissionKey: 'system.admin.all',
  })

  return { settings }
})
