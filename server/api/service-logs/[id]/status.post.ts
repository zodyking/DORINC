import { useDb } from '../../../db/client'
import {
  getServiceLog,
  MECHANIC_TRANSITIONS,
  ServiceLogsServiceError,
  transitionServiceLog,
} from '../../../services/service-logs.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { serviceLogStatusChangeSchema } from '../../../../shared/validators/service-logs'
import type { AuthContext } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const { status, reason, invoiceId } = await validateBody(event, serviceLogStatusChangeSchema)
  const db = useDb()

  try {
    const current = await getServiceLog(db, id)

    // Permission model (SPEC §6.4):
    // - converting requires service_logs.convert.all
    // - other review-side moves require service_logs.review.all
    // - mechanics may submit/resubmit their own logs to the queue
    if (status === 'converted_to_invoice') {
      if (!hasPermission(event, 'service_logs.convert.all')) {
        throw apiError(event, 'FORBIDDEN', 'You do not have permission to convert service logs')
      }
    }
    else if (!hasPermission(event, 'service_logs.review.all')) {
      const isOwner = current.submittedBy === auth.user.id
        && hasPermission(event, 'service_logs.upload.own', { ownsRecord: true })
      const mechanicAllowed = isOwner
        && MECHANIC_TRANSITIONS.some(t => t.from === current.status && t.to === status)
      if (!mechanicAllowed) {
        throw apiError(event, 'FORBIDDEN', 'You do not have permission to change this log status')
      }
    }

    const { log, before } = await transitionServiceLog(db, id, status, { reason, invoiceId })

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: id,
      action: `service_logs.status.${status}`,
      beforeData: { status: before.status },
      afterData: { status, reason: reason ?? null, invoiceId: invoiceId ?? null },
      changedFields: ['status'],
      riskLevel: status === 'converted_to_invoice' || status === 'rejected' ? 'sensitive' : 'normal',
    })

    return { log }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'That status change is not allowed from the current status')
      }
    }
    throw err
  }
})
