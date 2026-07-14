import { z } from 'zod'
import { useDb } from '../../../../db/client'
import { getRoleDetail, updateRole, RolesServiceError } from '../../../../services/roles.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string()).optional(),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'roles.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, updateSchema)
  const db = useDb()

  try {
    // Get before state for audit
    const before = await getRoleDetail(db, id)

    const result = await updateRole(db, {
      roleId: id,
      name: body.name,
      description: body.description,
      permissions: body.permissions,
      actorAccountType: actor.accountType,
    })

    if (result.changedFields.length > 0) {
      await writeAudit(event, {
        entityType: 'account_type',
        entityId: id,
        action: 'roles.update',
        beforeData: {
          name: before.name,
          description: before.description,
          permissions: before.permissions,
        },
        afterData: {
          name: result.role.name,
          description: result.role.description,
          permissions: result.permissions ?? before.permissions,
        },
        changedFields: result.changedFields,
        permissionKey: 'roles.manage.all',
        riskLevel: 'sensitive',
      })
    }

    return {
      status: 'updated',
      role: {
        id,
        key: result.role.key,
        name: result.role.name,
        description: result.role.description,
        isSystem: result.role.isSystem,
      },
      changedFields: result.changedFields,
    }
  }
  catch (err) {
    if (err instanceof RolesServiceError) {
      if (err.code === 'NOT_FOUND') {
        throw apiError(event, 'NOT_FOUND', 'Role not found')
      }
      if (err.code === 'SYSTEM_ROLE_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'This role cannot be modified')
      }
      if (err.code === 'SUPER_ADMIN_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Only Super Admin can modify system roles')
      }
    }
    throw err
  }
})
