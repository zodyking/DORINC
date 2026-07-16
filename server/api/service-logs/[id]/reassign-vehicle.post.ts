import { useDb } from '../../../db/client'
import { reassignServiceLogVehicle } from '../../../services/reassign.service'
import { writeAudit } from '../../../services/audit.service'
import { mapReassignError } from '../../../utils/map-reassign-error'
import { assertCanEditServiceLog } from '../../../utils/service-log-edit'
import { hasPermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { reassignServiceLogVehicleSchema } from '../../../../shared/validators/reassign'
import type { AuthContext } from '../../../utils/require-permission'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, reassignServiceLogVehicleSchema)
  const db = useDb()

  const canReassignAll = hasPermission(event, 'records.reassign.all')
  let permissionKey = 'records.reassign.all'
  if (!canReassignAll) {
    const ctx = await assertCanEditServiceLog(event, db, id)
    permissionKey = ctx.isReviewer ? 'service_logs.review.all' : 'service_logs.upload.own'
  }

  try {
    const result = await reassignServiceLogVehicle(db, id, body, auth.user.id)

    await writeAudit(event, {
      entityType: 'service_log',
      entityId: id,
      action: 'service_logs.reassign_vehicle',
      beforeData: {
        vehicleId: result.before.vehicleId,
        status: result.before.status,
      },
      afterData: {
        vehicleId: result.log.vehicleId,
        reason: body.reason ?? null,
      },
      permissionKey,
      riskLevel: 'sensitive',
    })

    return { log: result.log }
  }
  catch (err) {
    mapReassignError(event, err)
  }
})
