import { desc, eq, and } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { customers } from '../../../db/schema/customers'
import { listInvoices } from '../../../services/invoices.service'
import { getVehicle, VehiclesServiceError } from '../../../services/vehicles.service'
import { getLatestEntityDocument } from '../../../services/entity-documents.service'
import { apiError } from '../../../utils/api-error'
import { requirePermissionOrMessageLink } from '../../../utils/message-link-access'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermissionOrMessageLink(event, 'vehicles.read.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const vehicle = await getVehicle(db, id)
    const [customer] = await db
      .select({ id: customers.id, displayName: customers.displayName })
      .from(customers)
      .where(eq(customers.id, vehicle.customerId))

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
      .where(and(eq(auditLogs.entityType, 'vehicle'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    const invoiceList = await listInvoices(db, {
      vehicleId: id,
      page: 1,
      pageSize: 200,
      sort: 'newest',
    })

    const registrationDocument = await getLatestEntityDocument(db, 'vehicle', id, 'vehicle_registration')

    return {
      vehicle,
      customer: customer ?? null,
      history,
      recentInvoices: invoiceList.items,
      invoiceCount: invoiceList.total,
      registrationDocument,
    }
  }
  catch (err) {
    if (err instanceof VehiclesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    }
    throw err
  }
})
