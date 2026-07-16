import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import { CustomersServiceError } from '../../../services/customers.service'
import {
  PortalAccessServiceError,
  sendPortalCredentials,
} from '../../../services/portal-access.service'
import { apiError } from '../../../utils/api-error'
import { requireRateLimit } from '../../../utils/require-rate-limit'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { sendCredentialsSchema } from '../../../../shared/validators/customers'

function mapPortalError(event: Parameters<typeof apiError>[0], err: PortalAccessServiceError) {
  switch (err.code) {
    case 'NOT_FOUND':
    case 'CONTACT_NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Customer or contact not found')
    case 'NO_EMAIL':
      throw apiError(event, 'VALIDATION_ERROR', 'Set an account email on the customer before sending portal credentials')
    case 'EMAIL_IN_USE':
      throw apiError(event, 'CONFLICT', 'That email belongs to a staff account and cannot be used for portal access')
    case 'PORTAL_DISABLED':
      throw apiError(event, 'VALIDATION_ERROR', 'Enable portal access before sending credentials')
    case 'NOTIFICATION_DISABLED':
      throw apiError(event, 'VALIDATION_ERROR', 'Portal credential emails are disabled in Control Panel → Notifications')
    default:
      throw err
  }
}

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.send_credentials.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, sendCredentialsSchema)
  const auth = event.context.auth as { user: { id: string } }

  await requireRateLimit(event, 'credential_send', `${auth.user.id}:${id}`)

  try {
    const result = await sendPortalCredentials(useDb(), id, auth.user.id, body.contactId)

    await writeAudit(event, {
      entityType: 'customer',
      entityId: id,
      action: 'customers.credential_email_send',
      afterData: {
        credentialLogId: result.log.id,
        workerJobId: result.job.id,
        recipientEmail: result.log.recipientEmail,
        sendType: result.sendType,
      },
      permissionKey: 'customers.send_credentials.all',
      riskLevel: 'sensitive',
    })

    return {
      credentialLog: {
        id: result.log.id,
        recipientEmail: result.log.recipientEmail,
        sendType: result.sendType,
        status: result.log.status,
        createdAt: result.log.createdAt.toISOString(),
      },
      jobId: result.job.id,
    }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    if (err instanceof PortalAccessServiceError) mapPortalError(event, err)
    throw err
  }
})
