import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { approveUser, UsersServiceError } from '../../../../services/users.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

const approveSchema = z.object({
  accountType: z.enum(['admin', 'manager', 'accountant', 'mechanic', 'viewer', 'external_auditor']).optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, approveSchema)
  const db = useDb()

  try {
    const result = await approveUser(db, {
      userId: id,
      approvedBy: actor.id,
      accountTypeKey: body.accountType,
    })

    await writeAudit(event, {
      entityType: 'user',
      entityId: id,
      action: 'users.approve',
      beforeData: { accountType: result.previousAccountTypeKey, approvedAt: null },
      afterData: { accountType: result.accountTypeKey, approvedAt: result.user.approvedAt },
      changedFields: ['approvedAt', 'approvedBy', 'accountTypeId'],
      permissionKey: 'users.manage.all',
      riskLevel: 'sensitive',
    })

    return {
      status: 'approved',
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        accountType: result.accountTypeKey,
        approvedAt: result.user.approvedAt,
      },
    }
  }
  catch (err) {
    if (err instanceof UsersServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'User not found')
      if (err.code === 'NOT_PENDING') throw apiError(event, 'CONFLICT', 'User is not pending approval')
      if (err.code === 'INVALID_ACCOUNT_TYPE') throw apiError(event, 'VALIDATION_ERROR', 'Invalid account type')
    }
    throw err
  }
})
