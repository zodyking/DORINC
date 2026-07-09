import { z } from 'zod'
import { useDb } from '../../db/client'
import { getPendingDeletionRequest } from '../../services/deletion-requests.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { deletionEntityTypeSchema } from '../../../shared/validators/deletion-requests'
import { uuidSchema } from '../../../shared/validators/common'

const pendingQuerySchema = z.object({
  entityType: deletionEntityTypeSchema,
  entityId: uuidSchema,
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'deletion_requests.submit.all')
  const { entityType, entityId } = validateQuery(event, pendingQuerySchema)
  const pending = await getPendingDeletionRequest(useDb(), entityType, entityId)
  return {
    pending: pending
      ? {
          id: pending.id,
          status: pending.status,
          reason: pending.reason,
          createdAt: pending.createdAt.toISOString(),
        }
      : null,
  }
})
