import { z } from 'zod'
import { useDb } from '../../../../../db/client'
import { IpBanError, deleteIpBan } from '../../../../../services/security/ip-bans.service'
import { writeAudit } from '../../../../../services/audit.service'
import { apiError } from '../../../../../utils/api-error'
import { requirePermission } from '../../../../../utils/require-permission'
import { validateParams } from '../../../../../utils/validate'

const paramsSchema = z.object({ id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, paramsSchema)

  try {
    const ban = await deleteIpBan(useDb(), id)

    await writeAudit(event, {
      entityType: 'system',
      entityId: ban.id,
      action: 'security.ip_ban.delete',
      beforeData: { ipRule: ban.ipRule, reason: ban.reason, hitCount: ban.hitCount },
      riskLevel: 'high',
      permissionKey: 'system.admin.all',
    })

    return { ban }
  }
  catch (err) {
    if (err instanceof IpBanError) {
      throw apiError(event, 'NOT_FOUND', err.message)
    }
    throw err
  }
})
