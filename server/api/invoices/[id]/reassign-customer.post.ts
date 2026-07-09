import { useDb } from '../../../db/client'
import { reassignInvoiceCustomer } from '../../../services/reassign.service'
import { writeAudit } from '../../../services/audit.service'
import { mapReassignError } from '../../../utils/map-reassign-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { reassignInvoiceCustomerSchema } from '../../../../shared/validators/reassign'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'records.reassign.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, reassignInvoiceCustomerSchema)

  try {
    const result = await reassignInvoiceCustomer(useDb(), id, body, actor.id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.reassign_customer',
      beforeData: {
        customerId: result.before.customerId,
        vehicleId: result.before.vehicleId,
        status: result.before.status,
      },
      afterData: {
        customerId: result.invoice.customerId,
        vehicleId: result.invoice.vehicleId,
        clearedVehicle: result.clearedVehicle,
        reason: body.reason ?? null,
      },
      permissionKey: 'records.reassign.all',
      riskLevel: 'sensitive',
    })

    return {
      invoice: result.invoice,
      customer: { id: result.customer.id, displayName: result.customer.displayName },
      clearedVehicle: result.clearedVehicle,
    }
  }
  catch (err) {
    mapReassignError(event, err)
  }
})
