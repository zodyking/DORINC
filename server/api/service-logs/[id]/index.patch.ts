import { useDb } from '../../../db/client'
import {
  getServiceLog,
  isServiceLogEditable,
  promoteCustomerRequestedLog,
  ServiceLogsServiceError,
  updateServiceLog,
} from '../../../services/service-logs.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { serviceLogUpdateSchema } from '../../../../shared/validators/service-logs'
import type { AuthContext } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const patch = await validateBody(event, serviceLogUpdateSchema)
  const db = useDb()

  try {
    const current = await getServiceLog(db, id)

    const isReviewer = hasPermission(event, 'service_logs.review.all')
    const isOwner = current.submittedBy === auth.user.id
      && hasPermission(event, 'service_logs.upload.own', { ownsRecord: true })

    if (current.status === 'converted_to_invoice') {
      throw apiError(event, 'CONFLICT', 'Converted logs are read-only')
    }
    if (!isServiceLogEditable(current.status)) {
      throw apiError(event, 'CONFLICT', 'This service log can no longer be edited')
    }

    if (!isReviewer) {
      if (!isOwner) throw apiError(event, 'FORBIDDEN', 'You do not have permission to edit this service log')
    }

    const { log: updated, before, changedFields } = await updateServiceLog(db, id, patch)
    let log = updated
    const allChangedFields = [...changedFields]

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'service_log',
        entityId: id,
        action: 'service_logs.update',
        beforeData: Object.fromEntries(changedFields.map(f => [f, before[f as keyof typeof before]])),
        afterData: Object.fromEntries(changedFields.map(f => [f, log[f as keyof typeof log]])),
        changedFields,
        permissionKey: isReviewer ? 'service_logs.review.all' : 'service_logs.upload.own',
      })
    }

    if (isReviewer) {
      const { log: promoted, promoted: didPromote } = await promoteCustomerRequestedLog(db, id)
      if (didPromote) {
        log = promoted
        if (!allChangedFields.includes('status')) allChangedFields.push('status')
        await writeAudit(event, {
          entityType: 'service_log',
          entityId: id,
          action: 'service_logs.status.ready_for_review',
          beforeData: { status: before.status },
          afterData: { status: log.status },
          changedFields: ['status'],
          permissionKey: 'service_logs.review.all',
        })
      }
    }

    return { log, changedFields: allChangedFields, customerRequestPromoted: isReviewer && log.status === 'ready_for_review' && before.status !== 'ready_for_review' && before.customerRequested }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    throw err
  }
})
