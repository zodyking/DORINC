import { desc, eq, and } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { CustomersServiceError, getCustomer, getCustomerBillingSummary, listContacts } from '../../../services/customers.service'
import { listInvoices } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission, requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.read.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const customer = await getCustomer(db, id)
    const contacts = await listContacts(db, id)
    const billing = await getCustomerBillingSummary(db, id)

    const recentInvoices = hasPermission(event, 'invoices.read.all')
      ? (await listInvoices(db, {
          customerId: id,
          page: 1,
          pageSize: 8,
          sort: 'newest',
        })).items
      : []

    // Append-only change history straight from the audit trail (SPEC §6.1)
    const history = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: auditLogs.actorName,
        changedFields: auditLogs.changedFields,
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
