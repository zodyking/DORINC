import { useDb } from '../../../../db/client'
import { CatalogServiceError, updateCatalogItem } from '../../../../services/catalog.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { catalogItemUpdateSchema } from '../../../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const patch = await validateBody(event, catalogItemUpdateSchema)

  try {
    const { item, before, changedFields } = await updateCatalogItem(useDb(), id, patch)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'catalog_item',
        entityId: id,
        action: 'catalog.items.update',
        beforeData: Object.fromEntries(changedFields.map(f => [f, before[f as keyof typeof before]])),
        afterData: Object.fromEntries(changedFields.map(f => [f, item[f as keyof typeof item]])),
        changedFields,
        permissionKey: 'catalog.manage.all',
      })
    }

    return { item, changedFields }
  }
  catch (err) {
    if (err instanceof CatalogServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
      if (err.code === 'CATEGORY_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    throw err
  }
})
