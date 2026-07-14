import { eq } from 'drizzle-orm'
import { useDb } from '../../../../db/client'
import { accountTypePermissions, accountTypes, permissions, userPermissionOverrides, users } from '../../../../db/schema/auth'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import type { PermissionKey } from '../../../../../shared/permissions/keys'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.permissions.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  // Get user with account type
  const [userRow] = await db
    .select({
      user: users,
      accountTypeId: accountTypes.id,
      accountTypeKey: accountTypes.key,
      accountTypeName: accountTypes.name,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, id))

  if (!userRow) {
    throw apiError(event, 'NOT_FOUND', 'User not found')
  }

  // Get role grants
  const roleGrantRows = await db
    .select({ key: permissions.key })
    .from(accountTypePermissions)
    .innerJoin(permissions, eq(accountTypePermissions.permissionId, permissions.id))
    .where(eq(accountTypePermissions.accountTypeId, userRow.accountTypeId))

  const roleGrants = roleGrantRows.map(r => r.key as PermissionKey)

  // Get user overrides
  const overrideRows = await db
    .select({
      key: permissions.key,
      effect: userPermissionOverrides.effect,
      reason: userPermissionOverrides.reason,
      createdAt: userPermissionOverrides.createdAt,
    })
    .from(userPermissionOverrides)
    .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
    .where(eq(userPermissionOverrides.userId, id))

  const overrides = {
    allow: overrideRows.filter(r => r.effect === 'allow').map(r => ({
      key: r.key,
      reason: r.reason,
      createdAt: r.createdAt,
    })),
    deny: overrideRows.filter(r => r.effect === 'deny').map(r => ({
      key: r.key,
      reason: r.reason,
      createdAt: r.createdAt,
    })),
  }

  // Compute effective permissions
  const effective = new Set([...roleGrants, ...overrides.allow.map(o => o.key)])
  for (const denied of overrides.deny) {
    effective.delete(denied.key)
  }

  return {
    userId: id,
    accountType: {
      id: userRow.accountTypeId,
      key: userRow.accountTypeKey,
      name: userRow.accountTypeName,
    },
    roleGrants,
    overrides,
    effective: [...effective].sort(),
  }
})
