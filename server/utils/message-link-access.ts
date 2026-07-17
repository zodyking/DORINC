import { getQuery } from 'h3'
import type { H3Event } from 'h3'
import type { PermissionKey } from '../../shared/permissions/keys'
import { apiError } from './api-error'
import { hasPermission, requirePermission, type AuthContext } from './require-permission'

export const MESSAGE_LINK_REF = 'message'

export function isMessageLinkRequest(event: H3Event): boolean {
  const ref = getQuery(event).ref
  return ref === MESSAGE_LINK_REF
}

/** Staff opened a record from a team/DM entity link in Messages. */
export function canAccessViaMessageLink(event: H3Event): boolean {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) return false
  if (auth.user.accountType === 'customer') return false
  if (!isMessageLinkRequest(event)) return false
  return hasPermission(event, 'messages.read.own')
    || hasPermission(event, 'messages.read.all')
}

export function requirePermissionOrMessageLink(
  event: H3Event,
  required: PermissionKey,
  options: { ownsRecord?: boolean } = {},
): void {
  if (hasPermission(event, required, options)) return
  if (canAccessViaMessageLink(event)) return
  requirePermission(event, required, options)
}

export function requireAuthenticatedStaff(event: H3Event): AuthContext {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')
  if (auth.user.accountType === 'customer') {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to perform this action')
  }
  return auth
}
