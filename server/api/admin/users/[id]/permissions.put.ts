import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { useDb } from '../../../../db/client'
import { accountTypes, permissions, userPermissionOverrides, users } from '../../../../db/schema/auth'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import type { PermissionKey } from '../../../../../shared/permissions/keys'
import { ALL_PERMISSION_KEYS } from '../../../../../shared/permissions/keys'

const overrideSchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  reason: z.string().trim().max(500).optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.permissions.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, overrideSchema)
  const db = useDb()

  // Get user with account type
  const [userRow] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, id))

  if (!userRow) {
    throw apiError(event, 'NOT_FOUND', 'User not found')
  }

  // Cannot modify super_admin overrides unless you are super_admin
  if (userRow.accountTypeKey === 'super_admin' && actor.accountType !== 'super_admin') {
    throw apiError(event, 'FORBIDDEN', 'Only Super Admin can modify Super Admin permissions')
  }

  // Cannot grant system.admin.all via overrides (only super_admin has it)
  if (body.allow.includes('system.admin.all')) {
    throw apiError(event, 'VALIDATION_ERROR', 'Cannot grant system.admin.all via overrides')
  }

  // Validate permission keys
  const validAllowKeys = body.allow.filter(k => ALL_PERMISSION_KEYS.includes(k as PermissionKey))
  const validDenyKeys = body.deny.filter(k => ALL_PERMISSION_KEYS.includes(k as PermissionKey))

  // Get current overrides for audit
  const currentOverrides = await db
    .select({ key: permissions.key, effect: userPermissionOverrides.effect })
    .from(userPermissionOverrides)
    .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
    .where(eq(userPermissionOverrides.userId, id))

  const beforeAllow = currentOverrides.filter(o => o.effect === 'allow').map(o => o.key)
  const beforeDeny = currentOverrides.filter(o => o.effect === 'deny').map(o => o.key)

  // Delete all current overrides
  await db.delete(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, id))

  // Insert new overrides
  const allKeys = [...new Set([...validAllowKeys, ...validDenyKeys])]
  if (allKeys.length > 0) {
    const permRows = await db
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, allKeys))

    const permIdByKey = new Map(permRows.map(p => [p.key, p.id]))

    for (const key of validAllowKeys) {
      const permId = permIdByKey.get(key)
      if (permId) {
        await db.insert(userPermissionOverrides)
          .values({
            userId: id,
            permissionId: permId,
            effect: 'allow',
            reason: body.reason || null,
            createdBy: actor.id,
          })
          .onConflictDoNothing()
      }
    }

    for (const key of validDenyKeys) {
      const permId = permIdByKey.get(key)
      if (permId) {
        await db.insert(userPermissionOverrides)
          .values({
            userId: id,
            permissionId: permId,
            effect: 'deny',
            reason: body.reason || null,
            createdBy: actor.id,
          })
          .onConflictDoNothing()
      }
    }
  }

  // Determine what changed
  const changedFields: string[] = []
  if (JSON.stringify(beforeAllow.sort()) !== JSON.stringify(validAllowKeys.sort())) {
    changedFields.push('overrides.allow')
  }
  if (JSON.stringify(beforeDeny.sort()) !== JSON.stringify(validDenyKeys.sort())) {
    changedFields.push('overrides.deny')
  }

  if (changedFields.length > 0) {
    await writeAudit(event, {
      entityType: 'user',
      entityId: id,
      action: 'users.permissions.update',
      beforeData: { allow: beforeAllow, deny: beforeDeny },
      afterData: { allow: validAllowKeys, deny: validDenyKeys, reason: body.reason },
      changedFields,
      permissionKey: 'users.permissions.all',
      riskLevel: 'sensitive',
    })
  }

  return {
    status: 'updated',
    overrides: {
      allow: validAllowKeys,
      deny: validDenyKeys,
    },
    changedFields,
  }
})
