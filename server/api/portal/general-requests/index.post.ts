import { createGeneralRequest, PortalServiceError } from '../../../services/portal.service'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { portalGeneralRequestSchema } from '../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  requirePermission(event, 'portal.requests.own')
  const body = await validateBody(event, portalGeneralRequestSchema)

  try {
    const request = await createGeneralRequest(useDb(), user.customerId, user.id, body)

    await writeAudit(event, {
      entityType: 'portal_general_request',
      entityId: request.id,
      action: 'portal.general_request.create',
      afterData: {
        subject: request.subject,
        status: request.status,
      },
      permissionKey: 'portal.requests.own',
    })

    return {
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
    }
  }
  catch (err) {
    if (err instanceof PortalServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Customer not found')
      if (err.code === 'PORTAL_DISABLED') throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
