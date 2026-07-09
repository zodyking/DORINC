import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import {
  createDeletionRequest,
  DeletionRequestsServiceError,
} from '../../services/deletion-requests.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { deletionRequestCreateSchema } from '../../../shared/validators/deletion-requests'

function mapError(event: Parameters<typeof apiError>[0], err: DeletionRequestsServiceError) {
  switch (err.code) {
    case 'ENTITY_NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Record not found')
    case 'DUPLICATE_PENDING':
      throw apiError(event, 'CONFLICT', 'A deletion request is already pending for this record')
    case 'ALREADY_REMOVED':
      throw apiError(event, 'CONFLICT', 'This record is already archived or voided')
    case 'INVALID_TRANSITION':
      throw apiError(event, 'VALIDATION_ERROR', body.entityType === 'service_log'
        ? 'Service logs linked to an invoice cannot be deleted'
        : 'This record cannot be deleted in its current state')
    default:
      throw err
  }
}

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'deletion_requests.submit.all')
  const body = await validateBody(event, deletionRequestCreateSchema)

  try {
    const request = await createDeletionRequest(
      useDb(),
      body.entityType,
      body.entityId,
      body.reason,
      actor.id,
    )

    await writeAudit(event, {
      entityType: body.entityType,
      entityId: body.entityId,
      action: 'deletion_requests.submit',
      afterData: {
        requestId: request.id,
        entityType: body.entityType,
        reason: body.reason,
      },
      permissionKey: 'deletion_requests.submit.all',
      riskLevel: 'sensitive',
    })

    return {
      request: {
        id: request.id,
        entityType: request.entityType,
        entityId: request.entityId,
        status: request.status,
        entityLabel: request.entityLabel,
        createdAt: request.createdAt.toISOString(),
      },
    }
  }
  catch (err) {
    if (err instanceof DeletionRequestsServiceError) mapError(event, err)
    throw err
  }
})
