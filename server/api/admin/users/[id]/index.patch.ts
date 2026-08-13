import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { updateUser, UsersServiceError } from '../../../../services/users.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { emailSchema, idParamSchema, nonEmptyString } from '../../../../../shared/validators/common'
import { accountPhoneSchema } from '../../../../../shared/validators/account'

const updateSchema = z.object({
  // Accept any string - DB validation happens in the service layer
  accountType: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  disabledReason: z.string().trim().max(500).optional(),
  phone: accountPhoneSchema.optional(),
  firstName: nonEmptyString.max(60).optional(),
  lastName: nonEmptyString.max(60).optional(),
  email: emailSchema.optional(),
}).refine(
  data => (data.firstName === undefined) === (data.lastName === undefined),
  { message: 'First name and last name must be provided together', path: ['firstName'] },
)

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
      disabledReason: body.disabledReason,
      phone: body.phone,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
    })

    if (result.changedFields.length) {
      await writeAudit(event, {
        entityType: 'user',
        entityId: id,
        action: 'users.update',
        beforeData: {
          accountType: result.previous.accountTypeKey,
          isActive: result.previous.user.isActive,
          phone: result.previous.user.phone ?? null,
          name: result.previous.user.name,
          email: result.previous.user.email,
        },
        afterData: {
          accountType: result.accountTypeKey,
          isActive: result.user.isActive,
          phone: result.user.phone ?? null,
          name: result.user.name,
          email: result.user.email,
        },
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
        phone: result.user.phone ?? null,
        name: result.user.name,
        email: result.user.email,
      },
    }
  }
  catch (err) {
    if (err instanceof UsersServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'User not found')
      if (err.code === 'INVALID_ACCOUNT_TYPE') throw apiError(event, 'VALIDATION_ERROR', 'Invalid account type')
      if (err.code === 'INVALID_NAME') {
        throw apiError(event, 'VALIDATION_ERROR', 'First name and last name are required together')
      }
      if (err.code === 'EMAIL_TAKEN') {
        throw apiError(event, 'CONFLICT', 'An account with this email already exists')
      }
      if (err.code === 'SUPER_ADMIN_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Super Admin accounts cannot be modified this way')
      }
      if (err.code === 'SUSAN_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Susan’s system account cannot be edited, deactivated, or changed')
      }
    }
    throw err
  }
})
