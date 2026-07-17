import { desc, eq, and } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { CustomersServiceError, getCustomer, getCustomerBillingSummary, listContacts } from '../../../services/customers.service'
import { listInvoices } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { requirePermissionOrMessageLink } from '../../../utils/message-link-access'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermissionOrMessageLink(event, 'customers.read.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const customer = await getCustomer(db, id)
    const contacts = await listContacts(db, id)
    const billing = await getCustomerBillingSummary(db, id)

    // Summary rows for customer context — available to anyone who can view the customer.
    // Full invoice pages still require invoices.read.all.
    const recentInvoices = (await listInvoices(db, {
      customerId: id,
      page: 1,
      pageSize: Math.min(Math.max(billing.invoiceCount, 1), 200),
      sort: 'newest',
    })).items

    // Append-only change history straight from the audit trail (SPEC §6.1)
    const history = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: auditLogs.actorName,
        changedFields: auditLogs.changedFields,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'customer'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    return { customer, contacts, history, billing, recentInvoices }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    throw err
  }
})
