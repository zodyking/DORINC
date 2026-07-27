import { useDb } from '../../../../db/client'
import { IpBanError, createIpBan } from '../../../../services/security/ip-bans.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { ipBanCreateSchema } from '../../../../../shared/validators/security-access'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string, name: string, email: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, ipBanCreateSchema)

  try {
    const ban = await createIpBan(useDb(), {
      ipRule: body.ipRule,
      reason: body.reason,
      notes: body.notes,
      expiresAt: body.expiresAt ?? null,
      source: body.source,
      actor: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
    })

    await writeAudit(event, {
      entityType: 'system',
      entityId: ban.id,
      action: 'security.ip_ban.create',
      afterData: { ipRule: ban.ipRule, reason: ban.reason, expiresAt: ban.expiresAt, source: ban.source },
      riskLevel: 'high',
      permissionKey: 'system.admin.all',
    })

    return { ban }
  }
  catch (err) {
    if (err instanceof IpBanError) {
      throw apiError(event, 'VALIDATION_ERROR', err.message, { code: err.code })
    }
    throw err
  }
})
