import type { H3Event } from 'h3'
import type { PermissionKey } from '../../shared/permissions/keys'
import type { PermissionOverrides, PermissionUser } from '../../shared/permissions/evaluate'
import { evaluatePermission } from '../../shared/permissions/evaluate'
import { apiError } from './api-error'

export interface AuthContext {
  user: PermissionUser
  overrides: PermissionOverrides
}

/**
 * Enforce a permission on the current request. The auth context is attached
 * by the session middleware (P1-03); until then routes calling this return
 * 401 for anonymous requests, which is the safe default.
 */
export function requirePermission(
  event: H3Event,
  required: PermissionKey,
  options: { ownsRecord?: boolean } = {},
): PermissionUser {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) {
    throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')
  }

  const decision = evaluatePermission({
    user: auth.user,
    overrides: auth.overrides,
    required,
    ownsRecord: options.ownsRecord,
  })

  if (!decision.allowed) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to perform this action', {
      permission: required,
      reason: decision.reason,
    })
  }

  return auth.user
}
