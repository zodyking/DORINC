import { useDb } from '../../../db/client'
import { inviteStaffUser, StaffInviteServiceError } from '../../../services/staff-invite.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requireRateLimit } from '../../../utils/require-rate-limit'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { inviteStaffUserSchema } from '../../../../shared/validators/users'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const body = await validateBody(event, inviteStaffUserSchema)

  await requireRateLimit(event, 'credential_send', `${actor.id}:staff-invite`)

  try {
    const result = await inviteStaffUser(useDb(), {
      name: body.name,
      email: body.email,
      accountTypeKey: body.accountType,
      invitedBy: actor.id,
    })

    await writeAudit(event, {
      entityType: 'user',
      entityId: result.user.id,
      action: 'users.invite',
      afterData: {
        email: result.user.email,
        accountType: result.accountTypeKey,
      },
      permissionKey: 'users.manage.all',
      riskLevel: 'sensitive',
    })

    return {
      status: 'invited',
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        accountType: result.accountTypeKey,
      },
    }
  }
  catch (err) {
    if (err instanceof StaffInviteServiceError) {
      switch (err.code) {
        case 'EMAIL_IN_USE':
          throw apiError(event, 'CONFLICT', 'A user with that email already exists')
        case 'INVALID_ACCOUNT_TYPE':
          throw apiError(event, 'VALIDATION_ERROR', 'Invalid account type for staff invite')
        default:
          throw err
      }
    }
    throw err
  }
})
