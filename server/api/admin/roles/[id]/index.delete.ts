import { useDb } from '../../../../db/client'
import { deleteRole, getRoleDetail, RolesServiceError } from '../../../../services/roles.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'roles.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    // Get before state for audit
    const before = await getRoleDetail(db, id)

    const result = await deleteRole(db, id)

    await writeAudit(event, {
      entityType: 'account_type',
      entityId: id,
      action: 'roles.delete',
      beforeData: {
        key: before.key,
        name: before.name,
        permissions: before.permissions,
      },
      permissionKey: 'roles.manage.all',
      riskLevel: 'high',
    })

    return {
      status: 'deleted',
      role: {
        id,
        key: result.role.key,
        name: result.role.name,
      },
    }
  }
  catch (err) {
    if (err instanceof RolesServiceError) {
      if (err.code === 'NOT_FOUND') {
        throw apiError(event, 'NOT_FOUND', 'Role not found')
      }
      if (err.code === 'SYSTEM_ROLE_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'System roles cannot be deleted')
      }
      if (err.code === 'HAS_USERS_ASSIGNED') {
        throw apiError(event, 'CONFLICT', 'Cannot delete role with users assigned. Reassign users first.')
      }
    }
    throw err
  }
})
