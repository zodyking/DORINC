import { useDb } from '../../../db/client'
import { reassignServiceLog } from '../../../services/reassign.service'
import { writeAudit } from '../../../services/audit.service'
import { mapReassignError } from '../../../utils/map-reassign-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { reassignServiceLogSchema } from '../../../../shared/validators/reassign'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'records.reassign.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, reassignServiceLogSchema)

  try {
    const result = await reassignServiceLog(useDb(), id, body, actor.id)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: id,
      action: 'service_logs.reassign',
      beforeData: {
        customerId: result.before.customerId,
        vehicleId: result.before.vehicleId,
        status: result.before.status,
      },
      afterData: {
        customerId: result.log.customerId,
        vehicleId: result.log.vehicleId,
        reason: body.reason ?? null,
      },
      permissionKey: 'records.reassign.all',
      riskLevel: 'sensitive',
    })

    return {
      log: result.log,
      customer: { id: result.customer.id, displayName: result.customer.displayName },
    }
  }
  catch (err) {
    mapReassignError(event, err)
  }
})
