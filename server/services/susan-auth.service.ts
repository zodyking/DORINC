import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  accountTypePermissions,
  accountTypes,
  permissions,
  userPermissionOverrides,
  users,
} from '../db/schema/auth'
import type { AccountType, PermissionKey } from '../../shared/permissions/keys'
import {
  evaluatePermission,
  type PermissionDecision,
  type PermissionOverrides,
  type PermissionUser,
} from '../../shared/permissions/evaluate'
import { SUSAN_HELP_TOOLS, type AiToolName, type OpenAiToolDefinition } from '../../shared/ai-tools'

export type SusanAuthContext = {
  user: PermissionUser & { name: string }
  roleGrants: PermissionKey[]
  overrides: PermissionOverrides
}

/** Load staff permission context by user id (web help + SMS share this). */
export async function loadSusanAuthByUserId(
  db: Db,
  userId: string,
): Promise<SusanAuthContext | null> {
  const id = String(userId || '').trim()
  if (!id) return null

  const [row] = await db
    .select({
      user: users,
      accountTypeKey: accountTypes.key,
      accountTypeId: accountTypes.id,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, id))
    .limit(1)

  if (!row) return null

  const roleGrantRows = await db
    .select({ key: permissions.key })
    .from(accountTypePermissions)
    .innerJoin(permissions, eq(accountTypePermissions.permissionId, permissions.id))
    .where(eq(accountTypePermissions.accountTypeId, row.accountTypeId))

  const roleGrants = roleGrantRows.map(r => r.key as PermissionKey)

  const overrideRows = await db
    .select({ effect: userPermissionOverrides.effect, key: permissions.key })
    .from(userPermissionOverrides)
    .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
    .where(eq(userPermissionOverrides.userId, row.user.id))

  const overrides: PermissionOverrides = { allow: [], deny: [] }
  for (const o of overrideRows) {
    overrides[o.effect as 'allow' | 'deny'].push(o.key as PermissionKey)
  }

  return {
    user: {
      id: row.user.id,
      accountType: row.accountTypeKey as AccountType,
      isActive: row.user.isActive,
      emailVerifiedAt: row.user.emailVerifiedAt,
      approvedAt: row.user.approvedAt,
      name: row.user.name,
    },
    roleGrants,
    overrides,
  }
}

export function susanPermissionDecision(
  auth: SusanAuthContext,
  required: PermissionKey,
  options: { ownsRecord?: boolean } = {},
): PermissionDecision {
  return evaluatePermission({
    user: auth.user,
    roleGrants: auth.roleGrants,
    overrides: auth.overrides,
    required,
    ownsRecord: options.ownsRecord,
  })
}

export function susanHasPermission(
  auth: SusanAuthContext,
  required: PermissionKey,
  options: { ownsRecord?: boolean } = {},
): boolean {
  return susanPermissionDecision(auth, required, options).allowed
}

export function formatSusanPermissionDenial(
  required: PermissionKey,
  decision: PermissionDecision,
): string {
  if (decision.allowed) return ''
  if (decision.reason === 'inactive') {
    return 'Permission denied: this staff account is inactive.'
  }
  if (decision.reason === 'unverified') {
    return 'Permission denied: this staff account email is not verified yet.'
  }
  if (decision.reason === 'unapproved') {
    return 'Permission denied: this staff account is not approved yet.'
  }
  if (decision.reason === 'scope') {
    return `Permission denied: this record is outside the staff member’s scope (needs ${required} on an owned record, or a broader .all grant).`
  }
  return `Permission denied: this staff member cannot use this lookup (needs ${required}). Explain they lack access and how an admin can grant it in Users → permissions.`
}

const TOOL_PERMISSIONS: Partial<Record<AiToolName, PermissionKey | PermissionKey[]>> = {
  lookup_invoice: 'invoices.read.all',
  lookup_customer: 'customers.read.all',
  search_catalog: 'catalog.read.all',
  lookup_service_log: ['service_logs.read.all', 'service_logs.read.own'],
}

/** Only expose tools the staffer can actually use (avoids wasted tool rounds). */
export function filterSusanHelpToolsForAuth(auth: SusanAuthContext | null): OpenAiToolDefinition[] {
  return SUSAN_HELP_TOOLS.filter((tool) => {
    const name = tool.function.name
    if (name === 'get_app_knowledge') return true
    if (!auth) return false
    const required = TOOL_PERMISSIONS[name]
    if (!required) return false
    if (Array.isArray(required)) {
      return required.some(key => susanHasPermission(auth, key))
    }
    return susanHasPermission(auth, required)
  })
}
