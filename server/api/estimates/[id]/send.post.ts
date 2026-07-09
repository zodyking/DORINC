import { useDb } from '../../../db/client'
import { EstimatesServiceError, sendEstimate } from '../../../services/estimates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.manage.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const { estimate, before } = await sendEstimate(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: id,
      action: 'estimates.send',
      beforeData: { status: before.status },
      afterData: { status: estimate.status, sentAt: estimate.sentAt },
      changedFields: ['status', 'sentAt'],
      permissionKey: 'estimates.manage.all',
      riskLevel: 'sensitive',
    })

    return { estimate }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This estimate cannot be sent from its current status')
      }
    }
    throw err
  }
})
