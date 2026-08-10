import { useDb } from '../../../../db/client'
import { resetStaffPassword, StaffInviteServiceError } from '../../../../services/staff-invite.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireRateLimit } from '../../../../utils/require-rate-limit'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)

  await requireRateLimit(event, 'credential_send', `${actor.id}:staff-password-reset:${id}`)

  try {
    const result = await resetStaffPassword(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'user',
      entityId: id,
      action: 'users.password_reset',
      afterData: { email: result.email, accountType: result.accountTypeKey },
      permissionKey: 'users.manage.all',
      riskLevel: 'sensitive',
    })

    return { status: 'password_reset', email: result.email }
  }
  catch (err) {
    if (err instanceof StaffInviteServiceError) {
      switch (err.code) {
        case 'NOT_FOUND':
          throw apiError(event, 'NOT_FOUND', 'User not found')
        case 'CUSTOMER_ACCOUNT':
          throw apiError(event, 'VALIDATION_ERROR', 'Portal customer accounts cannot use staff password reset')
        case 'NOT_STAFF':
          throw apiError(event, 'VALIDATION_ERROR', 'Super admin accounts cannot use this password reset')
        case 'SUSAN_PROTECTED':
          throw apiError(event, 'FORBIDDEN', 'Susan’s system account cannot be edited')
        default:
          throw err
      }
    }
    throw err
  }
})
