import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import {
  DeletionRequestsServiceError,
  directDeleteEntity,
} from '../../services/deletion-requests.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { directDeleteSchema } from '../../../shared/validators/deletion-requests'

function mapError(event: Parameters<typeof apiError>[0], err: DeletionRequestsServiceError, entityType: string) {
  switch (err.code) {
    case 'ENTITY_NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Record not found')
    case 'INVALID_TRANSITION':
      throw apiError(event, 'VALIDATION_ERROR', entityType === 'service_log'
        ? 'Service logs linked to an invoice cannot be deleted'
        : entityType === 'invoice'
          ? 'Paid invoices cannot be deleted'
          : 'This record cannot be deleted in its current state')
    default:
      throw err
  }
}

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'deletion_requests.review.all')
  const body = await validateBody(event, directDeleteSchema)

  try {
    await directDeleteEntity(
      useDb(),
      body.entityType,
      body.entityId,
      actor.id,
      body.reason,
    )

    await writeAudit(event, {
      entityType: body.entityType,
      entityId: body.entityId,
      action: 'records.delete',
      afterData: {
        entityType: body.entityType,
        reason: body.reason ?? null,
      },
      permissionKey: 'deletion_requests.review.all',
      riskLevel: 'sensitive',
    })

    return { ok: true, entityType: body.entityType, entityId: body.entityId }
  }
  catch (err) {
    if (err instanceof DeletionRequestsServiceError) mapError(event, err, body.entityType)
    throw err
  }
})
