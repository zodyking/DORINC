import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../../db/client'
import { users } from '../../../../db/schema/auth'
import { hardDeleteUser, HardDeleteUserServiceError } from '../../../../services/hard-delete.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

const deleteSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  confirmEmail: z.string().email(),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, deleteSchema)
  const db = useDb()

  // Confirm email before mutating — never delete first.
  const [target] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, id))
  if (!target) {
    throw apiError(event, 'NOT_FOUND', 'User not found')
  }
  if (body.confirmEmail.toLowerCase() !== target.email.toLowerCase()) {
    throw apiError(event, 'VALIDATION_ERROR', 'Confirmation email does not match user email')
  }

  try {
    const result = await hardDeleteUser(db, id, actor.id, body.reason)

    await writeAudit(event, {
      entityType: 'user',
      entityId: id,
      action: 'users.hard_delete',
      beforeData: result.snapshot,
      afterData: { reason: body.reason },
      permissionKey: 'users.manage.all',
      riskLevel: 'high',
    })

    return {
      status: 'deleted',
      user: {
        id: result.id,
        email: result.snapshot.email,
        name: result.snapshot.name,
      },
    }
  }
  catch (err) {
    if (err instanceof HardDeleteUserServiceError) {
      if (err.code === 'NOT_FOUND') {
        throw apiError(event, 'NOT_FOUND', 'User not found')
      }
      if (err.code === 'SUPER_ADMIN_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Super Admin accounts cannot be deleted')
      }
      if (err.code === 'SELF_DELETE') {
        throw apiError(event, 'FORBIDDEN', 'You cannot delete your own account')
      }
      if (err.code === 'HAS_DEPENDENTS') {
        throw apiError(event, 'CONFLICT', 'User has activity that prevents deletion. Suspend the user instead.', {
          dependents: err.details,
        })
      }
    }
    console.error('[admin/users/delete]', err)
    throw apiError(event, 'INTERNAL_ERROR', 'Could not delete user — try again or suspend the account instead')
  }
})
