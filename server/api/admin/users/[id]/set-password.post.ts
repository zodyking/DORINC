import { useDb } from '../../../../db/client'
import { setStaffPassword, StaffInviteServiceError } from '../../../../services/staff-invite.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireRateLimit } from '../../../../utils/require-rate-limit'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { setStaffPasswordSchema } from '../../../../../shared/validators/users'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, setStaffPasswordSchema)

  await requireRateLimit(event, 'credential_send', `${actor.id}:staff-set-password:${id}`)

  try {
    const result = await setStaffPassword(useDb(), id, {
      password: body.password,
      mustChangePassword: body.mustChangePassword,
    })

    await writeAudit(event, {
      entityType: 'user',
      entityId: id,
      action: 'users.password_set',
      afterData: {
        email: result.email,
        accountType: result.accountTypeKey,
        mustChangePassword: result.mustChangePassword,
      },
      permissionKey: 'users.manage.all',
      riskLevel: 'sensitive',
    })

    return {
      status: 'password_set',
      email: result.email,
      mustChangePassword: result.mustChangePassword,
      emailVerified: result.emailVerified,
    }
  }
  catch (err) {
    if (err instanceof StaffInviteServiceError) {
      switch (err.code) {
        case 'NOT_FOUND':
          throw apiError(event, 'NOT_FOUND', 'User not found')
        case 'CUSTOMER_ACCOUNT':
          throw apiError(event, 'VALIDATION_ERROR', 'Portal customer accounts cannot use staff set-password')
        case 'NOT_STAFF':
          throw apiError(event, 'VALIDATION_ERROR', 'Super admin accounts cannot use this set-password')
        case 'SUSAN_PROTECTED':
          throw apiError(event, 'FORBIDDEN', 'Susan’s system account cannot be edited')
        default:
          throw err
      }
    }
    throw err
  }
})
