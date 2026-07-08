import { desc, eq, and } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { customers } from '../../../db/schema/customers'
import { getVehicle, VehiclesServiceError } from '../../../services/vehicles.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'vehicles.read.all')
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
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'vehicle'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    return { vehicle, customer: customer ?? null, history }
  }
  catch (err) {
    if (err instanceof VehiclesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    }
    throw err
  }
})
