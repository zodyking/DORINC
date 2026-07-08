import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { updateUser, UsersServiceError } from '../../../../services/users.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

const updateSchema = z.object({
  accountType: z.enum(['admin', 'manager', 'accountant', 'mechanic', 'viewer', 'external_auditor']).optional(),
  isActive: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, updateSchema)
  const db = useDb()

  try {
    const result = await updateUser(db, {
      userId: id,
      actor: { id: actor.id, accountType: actor.accountType },
      accountTypeKey: body.accountType,
      isActive: body.isActive,
    })

    if (result.changedFields.length) {
      await writeAudit(event, {
        entityType: 'user',
        entityId: id,
        action: 'users.update',
        beforeData: {
          accountType: result.previous.accountTypeKey,
          isActive: result.previous.user.isActive,
        },
        afterData: { accountType: result.accountTypeKey, isActive: result.user.isActive },
        changedFields: result.changedFields,
        permissionKey: 'users.manage.all',
        riskLevel: 'sensitive',
      })
    }

    return {
      status: 'updated',
      user: {
        id: result.user.id,
        accountType: result.accountTypeKey,
        isActive: result.user.isActive,
      },
    }
  }
  catch (err) {
    if (err instanceof UsersServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'User not found')
      if (err.code === 'INVALID_ACCOUNT_TYPE') throw apiError(event, 'VALIDATION_ERROR', 'Invalid account type')
      if (err.code === 'SUPER_ADMIN_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Super Admin accounts cannot be modified this way')
      }
    }
    throw err
  }
})
