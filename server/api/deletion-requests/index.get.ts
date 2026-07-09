import { useDb } from '../../db/client'
import {
  DeletionRequestsServiceError,
  listDeletionRequests,
} from '../../services/deletion-requests.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { deletionRequestListQuerySchema } from '../../../shared/validators/deletion-requests'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'deletion_requests.review.all')
  const query = validateQuery(event, deletionRequestListQuerySchema)
  return await listDeletionRequests(useDb(), query)
})
