import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  DeletionRequestsServiceError,
  rejectDeletionRequest,
} from '../../../services/deletion-requests.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { deletionRequestRejectSchema } from '../../../../shared/validators/deletion-requests'

function mapError(event: Parameters<typeof apiError>[0], err: DeletionRequestsServiceError) {
  switch (err.code) {
    case 'NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Deletion request not found')
    case 'NOT_PENDING':
      throw apiError(event, 'CONFLICT', 'This deletion request is no longer pending')
    default:
      throw err
  }
}

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'deletion_requests.review.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, deletionRequestRejectSchema)

  try {
    const { request } = await rejectDeletionRequest(useDb(), id, actor.id, body.reason)

    await writeAudit(event, {
      entityType: request.entityType,
      entityId: request.entityId,
      action: 'deletion_requests.reject',
      afterData: {
        requestId: request.id,
        entityType: request.entityType,
        reviewReason: body.reason,
      },
      permissionKey: 'deletion_requests.review.all',
      riskLevel: 'sensitive',
    })

    return { request }
  }
  catch (err) {
    if (err instanceof DeletionRequestsServiceError) mapError(event, err)
    throw err
  }
})
