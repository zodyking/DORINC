import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { rejectUser, UsersServiceError } from '../../../../services/users.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema, nonEmptyString } from '../../../../../shared/validators/common'

const rejectSchema = z.object({
  reason: nonEmptyString.max(500),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, rejectSchema)
  const db = useDb()

  try {
    const result = await rejectUser(db, {
      userId: id,
      rejectedBy: actor.id,
      reason: body.reason,
    })

    await writeAudit(event, {
      entityType: 'user',
      entityId: id,
      action: 'users.reject',
      beforeData: { rejectedAt: null, isActive: true },
      afterData: { rejectedAt: result.user.rejectedAt, reason: body.reason, isActive: false },
      changedFields: ['rejectedAt', 'rejectedReason', 'isActive', 'disabledAt'],
      permissionKey: 'users.manage.all',
      riskLevel: 'high',
    })

    return {
      status: 'rejected',
      user: {
        id: result.user.id,
        email: result.user.email,
        rejectedAt: result.user.rejectedAt,
      },
    }
  }
  catch (err) {
    if (err instanceof UsersServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'User not found')
      if (err.code === 'NOT_PENDING') throw apiError(event, 'CONFLICT', 'User is not pending approval')
    }
    throw err
  }
})
