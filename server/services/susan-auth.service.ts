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
  type PermissionOverrides,
  type PermissionUser,
} from '../../shared/permissions/evaluate'

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

export function susanHasPermission(
  auth: SusanAuthContext,
  required: PermissionKey,
  options: { ownsRecord?: boolean } = {},
): boolean {
  return evaluatePermission({
    user: auth.user,
    roleGrants: auth.roleGrants,
    overrides: auth.overrides,
    required,
    ownsRecord: options.ownsRecord,
  }).allowed
}
