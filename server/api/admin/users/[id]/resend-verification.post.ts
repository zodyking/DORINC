import { eq } from 'drizzle-orm'
import { useDb } from '../../../../db/client'
import { accountTypes, users } from '../../../../db/schema/auth'
import { issueVerificationToken } from '../../../../auth/auth.service'
import { enqueueVerificationEmail } from '../../../../services/verification-email.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  // Get user with account type
  const [row] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, id))

  if (!row) {
    throw apiError(event, 'NOT_FOUND', 'User not found')
  }

  // Only for internal (non-customer) users
  if (row.accountTypeKey === 'customer') {
    throw apiError(event, 'VALIDATION_ERROR', 'Cannot resend verification for customer accounts')
  }

  // Only for unverified users
  if (row.user.emailVerifiedAt) {
    throw apiError(event, 'CONFLICT', 'User email is already verified')
  }

  // Must be active and not rejected
  if (!row.user.isActive) {
    throw apiError(event, 'CONFLICT', 'Cannot resend verification for disabled accounts')
  }

  if (row.user.rejectedAt) {
    throw apiError(event, 'CONFLICT', 'Cannot resend verification for rejected accounts')
  }

  // Issue new verification token and send email
  const verificationToken = await issueVerificationToken(db, row.user.id)

  await enqueueVerificationEmail(db, {
    to: row.user.email,
    name: row.user.name,
    verificationToken,
  })

  await writeAudit(event, {
    entityType: 'user',
    entityId: id,
    action: 'users.resend_verification',
    afterData: { email: row.user.email },
    permissionKey: 'users.manage.all',
    riskLevel: 'normal',
  })

  return {
    status: 'sent',
    message: 'Verification email sent successfully',
    user: {
      id: row.user.id,
      email: row.user.email,
    },
  }
})
