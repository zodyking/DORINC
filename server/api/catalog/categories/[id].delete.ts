import { useDb } from '../../../db/client'
import { CatalogServiceError, deleteCategory } from '../../../services/catalog.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const category = await deleteCategory(useDb(), id)

    await writeAudit(event, {
      entityType: 'catalog_category',
      entityId: id,
      action: 'catalog.categories.delete',
      beforeData: { name: category.name },
      permissionKey: 'catalog.manage.all',
    })

    return { ok: true, category }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    throw err
  }
})
