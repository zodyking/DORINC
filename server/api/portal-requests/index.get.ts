import { useDb } from '../../db/client'
import { listStaffPortalRequests } from '../../services/portal-request-review.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { portalRequestReviewListQuerySchema } from '../../../shared/validators/portal-request-review'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'portal_requests.review.all')
  const query = validateQuery(event, portalRequestReviewListQuerySchema)
  return await listStaffPortalRequests(useDb(), query)
})
