import { useDb } from '../../../../db/client'
import { archiveCatalogItem, CatalogServiceError } from '../../../../services/catalog.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const item = await archiveCatalogItem(useDb(), id)

    await writeAudit(event, {
      entityType: 'catalog_item',
      entityId: id,
      action: 'catalog.items.archive',
      afterData: { archivedAt: item.archivedAt },
      permissionKey: 'catalog.manage.all',
    })

    return { item }
  }
  catch (err) {
    if (err instanceof CatalogServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
      if (err.code === 'ALREADY_ARCHIVED') throw apiError(event, 'CONFLICT', 'Item is already archived')
    }
    throw err
  }
})
