import { useDb } from '../../../db/client'
import { CatalogServiceError, createCatalogItem } from '../../../services/catalog.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogItemCreateSchema } from '../../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogItemCreateSchema)

  try {
    const item = await createCatalogItem(useDb(), body, actor.id)

    await writeAudit(event, {
      entityType: 'catalog_item',
      entityId: item.id,
      action: 'catalog.items.create',
      afterData: { name: item.name, itemType: item.itemType, sku: item.sku, taxable: item.taxable },
      permissionKey: 'catalog.manage.all',
    })

    return { item }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'CATEGORY_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    throw err
  }
})
