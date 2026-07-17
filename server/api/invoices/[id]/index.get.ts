import { and, desc, eq } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { getInvoiceDetail, InvoicesServiceError, recalculateInvoiceTotals } from '../../../services/invoices.service'
import { getInvoicePdfStatus } from '../../../services/invoice-pdf.service'
import { getInvoiceSendDeliveryStatus } from '../../../services/invoice-send.service'
import { apiError } from '../../../utils/api-error'
import { requirePermissionOrMessageLink } from '../../../utils/message-link-access'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { isExternalAuditor, redactInvoiceForAuditor } from '../../../utils/auditor-view'
import type { AuthContext } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  requirePermissionOrMessageLink(event, 'invoices.read.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const actorId = auth?.user.id ?? 'system'
    await recalculateInvoiceTotals(db, id, actorId)
    const invoice = await getInvoiceDetail(db, id)

    const history = await db.select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: auditLogs.actorName,
      changedFields: auditLogs.changedFields,
      beforeData: auditLogs.beforeData,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'invoice'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    const viewInvoice = isExternalAuditor(auth?.user.accountType)
      ? redactInvoiceForAuditor(invoice)
      : invoice

    let sendDelivery = null
    try {
      sendDelivery = await getInvoiceSendDeliveryStatus(db, id)
    }
    catch {
      sendDelivery = null
    }

    let pdf = null
    try {
      pdf = await getInvoicePdfStatus(db, id)
    }
    catch {
      pdf = null
    }

    return { invoice: viewInvoice, history, sendDelivery, pdf }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
