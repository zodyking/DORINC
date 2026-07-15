import {
  customerRejectEstimate,
  EstimatesServiceError,
} from '../../../../services/estimates.service'
import { useDb } from '../../../../db/client'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePortalCustomer } from '../../../../utils/require-portal'
import { validateBody, validateParams } from '../../../../utils/validate'
import { estimatePortalResponseSchema } from '../../../../../shared/validators/estimates'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const { id } = validateParams(event, idParamSchema)

  const body = await validateBody(event, estimatePortalResponseSchema)

  try {
    const { estimate, before } = await customerRejectEstimate(
      useDb(),
      id,
      user.customerId,
      user.id,
      body.notes,
    )

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: id,
      action: 'estimates.customer_reject',
      beforeData: { status: before.status },
      afterData: { status: estimate.status, customerResponseNotes: estimate.customerResponseNotes },
      changedFields: ['status', 'customerRejectedAt', 'customerResponseNotes'],
      permissionKey: 'portal.read.own',
      riskLevel: 'sensitive',
    })

    return { estimate: { id: estimate.id, status: estimate.status } }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This estimate cannot be rejected in its current state')
      }
    }
    throw err
  }
})
