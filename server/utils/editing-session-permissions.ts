import type { H3Event } from 'h3'
import type { PermissionKey } from '../../shared/permissions/keys'
import type { EditableEntityType } from '../db/schema/editing-sessions'
import type { PermissionUser } from '../../shared/permissions/evaluate'
import { hasPermission, requirePermission } from './require-permission'
import { apiError } from './api-error'

export function editingSessionUpdatePermission(entityType: EditableEntityType): PermissionKey {
  return entityType === 'estimate' ? 'estimates.manage.all' : 'invoices.update.all'
}

export function editingSessionReadPermission(entityType: EditableEntityType): PermissionKey {
  return entityType === 'estimate' ? 'estimates.read.all' : 'invoices.read.all'
}

export function requireEditingSessionUpdate(event: H3Event, entityType: EditableEntityType): PermissionUser {
  return requirePermission(event, editingSessionUpdatePermission(entityType))
}

export function requireEditingSessionRead(event: H3Event, entityType: EditableEntityType): PermissionUser {
  return requirePermission(event, editingSessionReadPermission(entityType))
}

/** Release/heartbeat routes only know session id — accept either invoice or estimate editors. */
export function requireEditingSessionActor(event: H3Event): PermissionUser {
  const auth = event.context.auth as { user?: PermissionUser } | undefined
  if (!auth?.user) {
    throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')
  }
  if (
    hasPermission(event, 'invoices.update.all')
    || hasPermission(event, 'estimates.manage.all')
  ) {
    return auth.user
  }
  throw apiError(event, 'FORBIDDEN', 'You do not have permission to perform this action')
}
