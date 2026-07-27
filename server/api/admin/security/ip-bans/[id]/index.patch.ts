import { z } from 'zod'
import { useDb } from '../../../../../db/client'
import { IpBanError, updateIpBan } from '../../../../../services/security/ip-bans.service'
import { writeAudit } from '../../../../../services/audit.service'
import { apiError } from '../../../../../utils/api-error'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../../utils/validate'
import { ipBanUpdateSchema } from '../../../../../../shared/validators/security-access'

const paramsSchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string, name: string } }
  requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, paramsSchema)
  const body = await validateBody(event, ipBanUpdateSchema)

  try {
    const ban = await updateIpBan(useDb(), id, {
      ...body,
      actor: { id: auth.user.id, name: auth.user.name },
    })

    await writeAudit(event, {
      entityType: 'system',
      entityId: ban.id,
      action: 'security.ip_ban.update',
      afterData: { ipRule: ban.ipRule, status: ban.status, expiresAt: ban.expiresAt, liftReason: ban.liftReason },
      riskLevel: 'high',
      permissionKey: 'system.admin.all',
    })

    return { ban }
  }
  catch (err) {
    if (err instanceof IpBanError) {
      throw apiError(event, err.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
