import { useDb } from '../../../../db/client'
import { getRoleDetail, RolesServiceError } from '../../../../services/roles.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'roles.manage.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const role = await getRoleDetail(useDb(), id)
    return { role }
  }
  catch (err) {
    if (err instanceof RolesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Role not found')
    }
    throw err
  }
})
