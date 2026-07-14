import { z } from 'zod'
import { useDb } from '../../../db/client'
import { createRole, RolesServiceError } from '../../../services/roles.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'

const createSchema = z.object({
  key: z.string().trim().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, 'Key must start with a letter and contain only lowercase letters, numbers, and underscores'),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string()).default([]),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'roles.manage.all')
  const body = await validateBody(event, createSchema)
  const db = useDb()

  try {
    const result = await createRole(db, body)

    await writeAudit(event, {
      entityType: 'account_type',
      entityId: result.role.id,
      action: 'roles.create',
      afterData: {
        key: result.role.key,
        name: result.role.name,
        permissions: result.permissions,
      },
      permissionKey: 'roles.manage.all',
      riskLevel: 'sensitive',
    })

    return {
      status: 'created',
      role: {
        id: result.role.id,
        key: result.role.key,
        name: result.role.name,
        description: result.role.description,
        isSystem: result.role.isSystem,
        permissions: result.permissions,
      },
    }
  }
  catch (err) {
    if (err instanceof RolesServiceError) {
      if (err.code === 'KEY_TAKEN') {
        throw apiError(event, 'CONFLICT', 'A role with this key already exists')
      }
      if (err.code === 'SYSTEM_ROLE_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Cannot create role with reserved key')
      }
    }
    throw err
  }
})
