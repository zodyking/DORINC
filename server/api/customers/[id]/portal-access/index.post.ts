import { useDb } from '../../../../db/client'
import { writeAudit } from '../../../../services/audit.service'
import { CustomersServiceError } from '../../../../services/customers.service'
import {
  PortalAccessServiceError,
  setPortalAccess,
} from '../../../../services/portal-access.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { portalAccessSchema } from '../../../../../shared/validators/customers'

function mapPortalError(event: Parameters<typeof apiError>[0], err: PortalAccessServiceError) {
  switch (err.code) {
    case 'NOT_FOUND':
    case 'CONTACT_NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Customer or contact not found')
    case 'NO_EMAIL':
      throw apiError(event, 'VALIDATION_ERROR', 'A contact with an email address is required for portal access')
    case 'EMAIL_IN_USE':
      throw apiError(event, 'CONFLICT', 'That email belongs to a staff account and cannot be used for portal access')
    case 'ALREADY_ENABLED':
      throw apiError(event, 'CONFLICT', 'Portal access is already enabled for this customer')
    case 'ALREADY_DISABLED':
      throw apiError(event, 'CONFLICT', 'Portal access is already disabled for this customer')
    default:
      throw err
  }
}

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.portal_access.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, portalAccessSchema)
  const auth = event.context.auth as { user: { id: string } }

  try {
    const result = await setPortalAccess(useDb(), id, body.enabled, auth.user.id, body.contactId)

    await writeAudit(event, {
      entityType: 'customer',
      entityId: id,
      action: body.enabled ? 'customers.portal_enable' : 'customers.portal_disable',
      afterData: { portalEnabled: result.enabled, contactId: body.contactId ?? null },
      permissionKey: 'customers.portal_access.all',
      riskLevel: 'sensitive',
    })

    return { portalEnabled: result.customer.portalEnabled }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    }
    if (err instanceof PortalAccessServiceError) mapPortalError(event, err)
    throw err
  }
})
