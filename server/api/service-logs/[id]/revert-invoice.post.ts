import { useDb } from '../../../db/client'
import {
  getServiceLog,
  revertServiceLogInvoice,
  ServiceLogsServiceError,
} from '../../../services/service-logs.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { canRevertServiceLogInvoice } from '../../../utils/service-log-actions'
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
    const allowed = await canRevertServiceLogInvoice(event, db, log)
    if (!allowed) {
      throw apiError(event, 'CONFLICT', 'This service log cannot be returned to editable status')
    }

    const { log: reverted, before, invoiceId } = await revertServiceLogInvoice(db, id)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: id,
      action: 'service_logs.revert_invoice',
      beforeData: { status: before.status, invoiceId: before.invoiceId },
      afterData: { status: reverted.status, invoiceId: reverted.invoiceId },
      changedFields: ['status', 'invoiceId'],
      permissionKey: 'service_logs.revert_invoice.own',
      riskLevel: 'sensitive',
    })

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'invoices.delete',
      beforeData: { id: invoiceId, serviceLogId: id },
      permissionKey: 'service_logs.revert_invoice.own',
      riskLevel: 'sensitive',
    })

    return { log: reverted }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Service log not found')
      if (err.code === 'INVALID_TRANSITION' || err.code === 'NOT_REVERTIBLE') {
        throw apiError(event, 'CONFLICT', 'This service log cannot be returned to editable status')
      }
    }
    throw err
  }
})
