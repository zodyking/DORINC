import { useDb } from '../../../db/client'
import { sendSmtpTest } from '../../../services/system-admin.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { smtpTestSchema } from '../../../../shared/validators/system-admin'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const auth = event.context.auth as { user: { name: string, email: string } }
  const body = await validateBody(event, smtpTestSchema)
  const to = body.to ?? auth.user.email

  const status = await sendSmtpTest(useDb(), to, auth.user.name)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.smtp.test',
    afterData: { to, delivered: status.delivered },
    permissionKey: 'system.admin.all',
    riskLevel: 'sensitive',
  })

  if (!status.delivered && process.env.NODE_ENV === 'production') {
    throw apiError(event, 'INTERNAL_ERROR', 'SMTP test message could not be delivered')
  }

  return {
    delivered: status.delivered,
    to,
    message: status.delivered
      ? `Test email sent to ${to}`
      : `SMTP test logged in development (target: ${to})`,
  }
})
