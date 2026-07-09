import { z } from 'zod'
import { useDb } from '../../../../db/client'
import {
  PortalRequestReviewError,
  rejectPortalRequest,
} from '../../../../services/portal-request-review.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import {
  PORTAL_REQUEST_REVIEW_KINDS,
  portalRequestRejectSchema,
} from '../../../../../shared/validators/portal-request-review'

const kindParamSchema = z.object({
  kind: z.enum(PORTAL_REQUEST_REVIEW_KINDS),
  id: idParamSchema.shape.id,
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'portal_requests.review.all')
  const { kind, id } = validateParams(event, kindParamSchema)
  const body = await validateBody(event, portalRequestRejectSchema)

  try {
    const request = await rejectPortalRequest(useDb(), kind, id, actor.id, body.reason)

    const entityType = kind === 'invoice_change'
      ? 'invoice_change_request'
      : kind === 'vehicle_change'
        ? 'vehicle_change_request'
        : kind === 'new_vehicle'
          ? 'new_vehicle_request'
          : kind === 'general'
            ? 'portal_general_request'
            : 'service_request'

    await writeAudit(event, {
      entityType,
      entityId: id,
      action: 'portal_requests.reject',
      afterData: {
        kind,
        status: 'rejected',
        reviewReason: body.reason,
      },
      permissionKey: 'portal_requests.review.all',
      riskLevel: 'normal',
    })

    return { request }
  }
  catch (err) {
    if (err instanceof PortalRequestReviewError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Portal request not found')
      if (err.code === 'NOT_PENDING') throw apiError(event, 'CONFLICT', 'This request has already been reviewed')
    }
    throw err
  }
})
