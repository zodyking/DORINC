import { useDb } from '../../../../db/client'
import { saveSecurityPolicy } from '../../../../services/security/policy.service'
import { writeAudit } from '../../../../services/audit.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { securityPolicySchema } from '../../../../../shared/validators/security-access'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')

  const body = await validateBody(event, securityPolicySchema)
  const policy = await saveSecurityPolicy(useDb(), body, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.security_policy.update',
    afterData: {
      enabled: policy.enabled,
      ipEnforcement: policy.ipEnforcement,
      geoEnforcement: policy.geoEnforcement,
      geoUnknownAction: policy.geoUnknownAction,
      enforceOnApi: policy.enforceOnApi,
      autoBanEnabled: policy.autoBan.enabled,
      recordCredentials: policy.recordCredentials,
      retentionDays: policy.retentionDays,
    },
    riskLevel: 'high',
    permissionKey: 'system.admin.all',
  })

  return { policy }
})
