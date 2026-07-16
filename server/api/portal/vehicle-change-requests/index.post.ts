import { eq } from 'drizzle-orm'
import { vehicles } from '../../../db/schema/vehicles'
import {
  createVehicleChangeRequest,
  getPortalCustomer,
  PortalServiceError,
} from '../../../services/portal.service'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import { notifyCustomerChangeRequestSubmitted } from '../../../services/staff-notifications.service'
import { buildVehicleSnapshot } from '../../../services/entity-snapshots'
import { formatPdfVehicleUnitDisplay } from '../../../../shared/document-pdf-payload'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { portalVehicleChangeRequestSchema } from '../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  requirePermission(event, 'portal.requests.own')
  const body = await validateBody(event, portalVehicleChangeRequestSchema)

  try {
    const db = useDb()
    const request = await createVehicleChangeRequest(db, user.customerId, user.id, body)
    const customer = await getPortalCustomer(db, user.customerId)

    await writeAudit(event, {
      entityType: 'vehicle_change_request',
      entityId: request.id,
      action: 'portal.vehicle_change_request.create',
      afterData: {
        vehicleId: request.vehicleId,
        subject: request.subject,
        status: request.status,
      },
      permissionKey: 'portal.requests.own',
    })

    let vehicleLabel: string | null = null
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, request.vehicleId)).limit(1)
    if (vehicle) vehicleLabel = formatPdfVehicleUnitDisplay(buildVehicleSnapshot(vehicle))

    void notifyCustomerChangeRequestSubmitted(db, {
      requestId: request.id,
      customerId: user.customerId,
      customerName: customer.displayName,
      requestKind: 'vehicle_change',
      topic: request.subject,
      message: request.description,
      vehicleLabel,
    }).catch(() => {})

    return {
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
    }
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
      if (err.code === 'INVALID_VEHICLE') throw apiError(event, 'VALIDATION_ERROR', 'Vehicle not found')
    }
    throw err
  }
})
