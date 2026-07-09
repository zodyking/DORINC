import type { H3Event } from 'h3'
import type { PermissionUser } from '../../shared/permissions/evaluate'
import type { AuthContext } from './require-permission'
import { requirePermission } from './require-permission'
import { apiError } from './api-error'

export interface PortalAuthUser extends PermissionUser {
  name: string
  email: string
  customerId: string
}

export interface PortalAuthContext extends AuthContext {
  user: PortalAuthUser
}

/**
 * Require a signed-in customer portal user with a linked customer_id (SPEC §19).
 * All portal routes must call this instead of bare requirePermission().
 */
export function requirePortalCustomer(event: H3Event): PortalAuthUser {
  const user = requirePermission(event, 'portal.read.own') as PortalAuthUser & { customerId: string | null }

  if (user.accountType !== 'customer') {
    throw apiError(event, 'FORBIDDEN', 'Customer portal access only', { reason: 'not_customer' })
  }

  if (!user.customerId) {
    throw apiError(event, 'FORBIDDEN', 'Portal account is not linked to a customer', { reason: 'no_customer_link' })
  }

  return { ...user, customerId: user.customerId }
}

/** IDOR guard — reject when a record belongs to another customer (returns 404). */
export function assertPortalCustomerScope(
  event: H3Event,
  customerId: string,
  recordCustomerId: string,
  entityLabel = 'Record',
): void {
  if (recordCustomerId !== customerId) {
    throw apiError(event, 'NOT_FOUND', `${entityLabel} not found`)
  }
}

export function getPortalCustomerId(event: H3Event): string {
  return requirePortalCustomer(event).customerId
}
