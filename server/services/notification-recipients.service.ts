import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  accountTypePermissions,
  accountTypes,
  permissions,
  userPermissionOverrides,
  users,
} from '../db/schema/auth'
import type { PermissionKey } from '../../shared/permissions/keys'

export interface StaffNotifyRecipient {
  id: string
  name: string
  email: string
}

/**
 * Active staff users who effectively have a permission
 * (account-type grant or allow override, excluding deny overrides).
 */
export async function listUsersWithPermission(
  db: Db,
  permissionKey: PermissionKey,
): Promise<StaffNotifyRecipient[]> {
  const [perm] = await db.select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, permissionKey))
    .limit(1)

  if (!perm) return []

  const viaBundle = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .innerJoin(accountTypePermissions, eq(accountTypePermissions.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.isActive, true),
      eq(accountTypePermissions.permissionId, perm.id),
      ne(accountTypes.key, 'customer'),
      sql`NOT EXISTS (
        SELECT 1 FROM user_permission_overrides upo
        WHERE upo.user_id = ${users.id}
          AND upo.permission_id = ${perm.id}
          AND upo.effect = 'deny'
      )`,
    ))

  const viaOverride = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
    .from(users)
    .innerJoin(userPermissionOverrides, eq(userPermissionOverrides.userId, users.id))
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.isActive, true),
      eq(userPermissionOverrides.permissionId, perm.id),
      eq(userPermissionOverrides.effect, 'allow'),
      ne(accountTypes.key, 'customer'),
    ))

  const byId = new Map<string, StaffNotifyRecipient>()
  for (const row of [...viaBundle, ...viaOverride]) {
    if (!row.email?.trim()) continue
    byId.set(row.id, row)
  }
  return [...byId.values()]
}

/** Recipients for a staff notification, optionally excluding one user (e.g. the actor). */
export async function listPermissionRecipients(
  db: Db,
  permissionKey: PermissionKey,
  excludeUserId?: string | null,
): Promise<StaffNotifyRecipient[]> {
  const rows = await listUsersWithPermission(db, permissionKey)
  if (!excludeUserId) return rows
  return rows.filter(r => r.id !== excludeUserId)
}

/** Deduplicate emails while preserving first-seen order. */
export function uniqueEmails(recipients: Array<{ email: string }>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of recipients) {
    const email = r.email.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(r.email.trim())
  }
  return out
}

/** Active approved staff (everyone except portal customers). */
export async function listAllTeamMembers(
  db: Db,
  excludeUserId?: string | null,
): Promise<StaffNotifyRecipient[]> {
  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.isActive, true),
      isNotNull(users.approvedAt),
      ne(accountTypes.key, 'customer'),
    ))

  if (!excludeUserId) return rows.filter(r => r.email?.trim())
  return rows.filter(r => r.id !== excludeUserId && r.email?.trim())
}

/** Active approved users with the accountant account type. */
export async function listAccountants(
  db: Db,
  excludeUserId?: string | null,
): Promise<StaffNotifyRecipient[]> {
  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.isActive, true),
      isNotNull(users.approvedAt),
      eq(accountTypes.key, 'accountant'),
    ))

  if (!excludeUserId) return rows.filter(r => r.email?.trim())
  return rows.filter(r => r.id !== excludeUserId && r.email?.trim())
}
