import { useDb } from '../../../../db/client'
import { resendStaffInvite, StaffInviteServiceError } from '../../../../services/staff-invite.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireRateLimit } from '../../../../utils/require-rate-limit'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)

  await requireRateLimit(event, 'credential_send', `${actor.id}:staff-invite:${id}`)

  try {
    const result = await resendStaffInvite(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'user',
      entityId: id,
      action: 'users.invite_resend',
      afterData: { email: result.email, accountType: result.accountTypeKey },
      permissionKey: 'users.manage.all',
      riskLevel: 'sensitive',
    })

    return { status: 'invited', email: result.email }
  }
  catch (err) {
    if (err instanceof StaffInviteServiceError) {
      switch (err.code) {
        case 'NOT_FOUND':
          throw apiError(event, 'NOT_FOUND', 'User not found')
        case 'CUSTOMER_ACCOUNT':
          throw apiError(event, 'VALIDATION_ERROR', 'Portal customer accounts cannot receive staff invites')
        case 'NOT_STAFF':
          throw apiError(event, 'VALIDATION_ERROR', 'Super admin accounts cannot be re-invited')
        default:
          throw err
      }
    }
    throw err
  }
})
