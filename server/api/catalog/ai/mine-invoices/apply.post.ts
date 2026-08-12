import { useDb } from '../../../../db/client'
import {
  addMinedItemsToCatalog,
  CatalogAiServiceError,
} from '../../../../services/catalog-ai.service'
import { CatalogServiceError } from '../../../../services/catalog.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { catalogMineInvoicesApplySchema } from '../../../../../shared/validators/catalog'

/** Create catalog items from audited commonly-billed candidates. */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogMineInvoicesApplySchema)

  try {
    const result = await addMinedItemsToCatalog(useDb(), body.items, actor.id)

    await writeAudit(event, {
      entityType: 'catalog',
      entityId: result.created[0]?.id ?? actor.id,
      action: 'catalog.ai.mine_invoices.add',
      afterData: {
        createdCount: result.created.length,
        names: result.created.map(c => c.name),
      },
      permissionKey: 'catalog.manage.all',
    })

    return result
  }
  catch (err) {
    if (err instanceof CatalogAiServiceError && err.code === 'EMPTY_SELECTION') {
      throw apiError(event, 'VALIDATION_ERROR', err.message)
    }
    if (err instanceof CatalogServiceError && err.code === 'CATEGORY_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    throw err
  }
})
