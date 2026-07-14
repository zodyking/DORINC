import { and, asc, count, eq, inArray, notInArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypePermissions, accountTypes, permissions, users } from '../db/schema/auth'
import type { PermissionKey } from '../../shared/permissions/keys'
import { ALL_PERMISSION_KEYS } from '../../shared/permissions/keys'

export type RolesServiceErrorCode
  = | 'NOT_FOUND'
    | 'KEY_TAKEN'
    | 'SYSTEM_ROLE_PROTECTED'
    | 'HAS_USERS_ASSIGNED'
    | 'INVALID_PERMISSION'
    | 'SUPER_ADMIN_PROTECTED'

export class RolesServiceError extends Error {
  constructor(public readonly code: RolesServiceErrorCode) {
    super(code)
  }
}

/** Protected roles that cannot be modified or deleted. */
export const IMMUTABLE_ROLES = ['super_admin', 'customer'] as const

/** List all roles with permission counts and user counts. */
export async function listRoles(db: Db) {
  const roleRows = await db.select({
    id: accountTypes.id,
    key: accountTypes.key,
    name: accountTypes.name,
    description: accountTypes.description,
    isSystem: accountTypes.isSystem,
    createdAt: accountTypes.createdAt,
  })
    .from(accountTypes)
    .orderBy(asc(accountTypes.name))

  const results = []
  for (const role of roleRows) {
    const [permCount] = await db.select({ value: count() })
      .from(accountTypePermissions)
      .where(eq(accountTypePermissions.accountTypeId, role.id))

    const [userCount] = await db.select({ value: count() })
      .from(users)
      .where(eq(users.accountTypeId, role.id))

    results.push({
      ...role,
      permissionCount: permCount!.value,
      userCount: userCount!.value,
    })
  }

  return results
}

/** Get detailed role info including all granted permissions. */
export async function getRoleDetail(db: Db, roleId: string) {
  const [role] = await db.select()
    .from(accountTypes)
    .where(eq(accountTypes.id, roleId))

  if (!role) throw new RolesServiceError('NOT_FOUND')

  const grantRows = await db.select({ key: permissions.key })
    .from(accountTypePermissions)
    .innerJoin(permissions, eq(accountTypePermissions.permissionId, permissions.id))
    .where(eq(accountTypePermissions.accountTypeId, roleId))

  const [userCount] = await db.select({ value: count() })
    .from(users)
    .where(eq(users.accountTypeId, roleId))

  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: grantRows.map(r => r.key as PermissionKey),
    userCount: userCount!.value,
  }
}

export interface CreateRoleInput {
  key: string
  name: string
  description?: string
  permissions: string[]
}

/** Create a custom role (isSystem = false). */
export async function createRole(db: Db, input: CreateRoleInput) {
  const normalizedKey = input.key.trim().toLowerCase().replace(/\s+/g, '_')

  // Check key uniqueness
  const [existing] = await db.select({ id: accountTypes.id })
    .from(accountTypes)
    .where(eq(accountTypes.key, normalizedKey))
  if (existing) throw new RolesServiceError('KEY_TAKEN')

  // Cannot create with super_admin or customer keys
  if (IMMUTABLE_ROLES.includes(normalizedKey as typeof IMMUTABLE_ROLES[number])) {
    throw new RolesServiceError('SYSTEM_ROLE_PROTECTED')
  }

  // Validate permissions exist - cannot grant system.admin.all to custom roles
  const validPermissions = input.permissions.filter(p => 
    ALL_PERMISSION_KEYS.includes(p as PermissionKey) && p !== 'system.admin.all'
  )

  const [role] = await db.insert(accountTypes)
    .values({
      key: normalizedKey,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isSystem: false,
    })
    .returning()

  // Grant permissions
  if (validPermissions.length > 0) {
    const permRows = await db.select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, validPermissions))

    for (const perm of permRows) {
      await db.insert(accountTypePermissions)
        .values({ accountTypeId: role!.id, permissionId: perm.id })
        .onConflictDoNothing()
    }
  }

  return { role: role!, permissions: validPermissions }
}

export interface UpdateRoleInput {
  roleId: string
  name?: string
  description?: string
  permissions?: string[]
  actorAccountType: string
}

/** Update a role's name, description, and/or permission set. */
export async function updateRole(db: Db, input: UpdateRoleInput) {
  const [role] = await db.select()
    .from(accountTypes)
    .where(eq(accountTypes.id, input.roleId))

  if (!role) throw new RolesServiceError('NOT_FOUND')

  // super_admin and customer are immutable
  if (IMMUTABLE_ROLES.includes(role.key as typeof IMMUTABLE_ROLES[number])) {
    throw new RolesServiceError('SYSTEM_ROLE_PROTECTED')
  }

  // Only super_admin can modify system roles (admin, manager, etc.)
  if (role.isSystem && input.actorAccountType !== 'super_admin') {
    throw new RolesServiceError('SUPER_ADMIN_PROTECTED')
  }

  const updates: Partial<typeof accountTypes.$inferInsert> = { updatedAt: new Date() }
  const changedFields: string[] = []

  if (input.name !== undefined && input.name !== role.name) {
    updates.name = input.name.trim()
    changedFields.push('name')
  }

  if (input.description !== undefined && input.description !== role.description) {
    updates.description = input.description?.trim() || null
    changedFields.push('description')
  }

  // Update permissions if provided
  let newPermissions: string[] | undefined
  if (input.permissions !== undefined) {
    // Cannot grant system.admin.all except to super_admin (which is immutable anyway)
    const validPermissions = input.permissions.filter(p =>
      ALL_PERMISSION_KEYS.includes(p as PermissionKey) &&
      (p !== 'system.admin.all' || role.key === 'super_admin')
    )

    // Get current permissions
    const currentPerms = await db.select({ key: permissions.key })
      .from(accountTypePermissions)
      .innerJoin(permissions, eq(accountTypePermissions.permissionId, permissions.id))
      .where(eq(accountTypePermissions.accountTypeId, input.roleId))

    const currentKeys = new Set(currentPerms.map(p => p.key))
    const newKeys = new Set(validPermissions)

    // Find permissions to remove and add
    const toRemove = [...currentKeys].filter(k => !newKeys.has(k))
    const toAdd = [...newKeys].filter(k => !currentKeys.has(k))

    if (toRemove.length > 0 || toAdd.length > 0) {
      changedFields.push('permissions')
      newPermissions = validPermissions

      // Remove old permissions
      if (toRemove.length > 0) {
        const removePermIds = await db.select({ id: permissions.id })
          .from(permissions)
          .where(inArray(permissions.key, toRemove))

        for (const perm of removePermIds) {
          await db.delete(accountTypePermissions)
            .where(and(
              eq(accountTypePermissions.accountTypeId, input.roleId),
              eq(accountTypePermissions.permissionId, perm.id),
            ))
        }
      }

      // Add new permissions
      if (toAdd.length > 0) {
        const addPermRows = await db.select({ id: permissions.id })
          .from(permissions)
          .where(inArray(permissions.key, toAdd))

        for (const perm of addPermRows) {
          await db.insert(accountTypePermissions)
            .values({ accountTypeId: input.roleId, permissionId: perm.id })
            .onConflictDoNothing()
        }
      }
    }
  }

  // Apply name/description updates
  if (Object.keys(updates).length > 1) {
    await db.update(accountTypes)
      .set(updates)
      .where(eq(accountTypes.id, input.roleId))
  }

  return {
    role: { ...role, ...updates },
    permissions: newPermissions,
    changedFields,
  }
}

/** Delete a custom role. Fails if system role or has users assigned. */
export async function deleteRole(db: Db, roleId: string) {
  const [role] = await db.select()
    .from(accountTypes)
    .where(eq(accountTypes.id, roleId))

  if (!role) throw new RolesServiceError('NOT_FOUND')

  // Cannot delete system roles
  if (role.isSystem) {
    throw new RolesServiceError('SYSTEM_ROLE_PROTECTED')
  }

  // Cannot delete if users are assigned
  const [userCount] = await db.select({ value: count() })
    .from(users)
    .where(eq(users.accountTypeId, roleId))

  if (userCount!.value > 0) {
    throw new RolesServiceError('HAS_USERS_ASSIGNED')
  }

  // Delete permission grants first (cascade should handle this, but be explicit)
  await db.delete(accountTypePermissions)
    .where(eq(accountTypePermissions.accountTypeId, roleId))

  // Delete the role
  await db.delete(accountTypes)
    .where(eq(accountTypes.id, roleId))

  return { role }
}

/** Get all permissions grouped by module for the permission matrix UI. */
export async function listPermissions(db: Db) {
  const rows = await db.select()
    .from(permissions)
    .orderBy(asc(permissions.module), asc(permissions.key))

  const grouped: Record<string, Array<{ key: string, description: string | null }>> = {}
  for (const row of rows) {
    if (!grouped[row.module]) grouped[row.module] = []
    grouped[row.module].push({ key: row.key, description: row.description })
  }

  return grouped
}
