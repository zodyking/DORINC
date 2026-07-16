import { and, desc, eq } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { getServiceLog, ServiceLogsServiceError, getInvoiceRevertStatus } from '../../../services/service-logs.service'
import { listUserUploadsByOwner } from '../../../services/files.service'
import { apiError } from '../../../utils/api-error'
import { canRevertServiceLogInvoice, canSendServiceLogToInvoice } from '../../../utils/service-log-actions'
import { hasPermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import type { AuthContext } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const log = await getServiceLog(db, id)

    const allowed = hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
    if (!allowed) throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this service log')

    // User uploads only — excludes thumbnail/preview derivatives (SPEC §8)
    const files = await listUserUploadsByOwner(db, {
      ownerEntityType: 'service_log',
      ownerEntityId: id,
    })

    const history = await db.select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: auditLogs.actorName,
      changedFields: auditLogs.changedFields,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'service_log'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    const canSendToInvoice = canSendServiceLogToInvoice(event, log)
    const canRevertInvoice = await canRevertServiceLogInvoice(event, db, log)
    const revertBlockReason = log.invoiceId && !canRevertInvoice
      ? (await getInvoiceRevertStatus(db, log.invoiceId)).reason
      : null

    return {
      log,
      files,
      history,
      actions: {
        canSendToInvoice,
        canRevertInvoice,
        revertBlockReason,
      },
    }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    throw err
  }
})
