import { and, desc, eq } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { getInvoiceDetail, InvoicesServiceError } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.read.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const invoice = await getInvoiceDetail(db, id)

    const history = await db.select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: auditLogs.actorName,
      changedFields: auditLogs.changedFields,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'invoice'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    return { invoice, history }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
