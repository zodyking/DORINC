import { useDb } from '../../../../db/client'
import {
  applyCatalogCategorySort,
  CatalogAiServiceError,
} from '../../../../services/catalog-ai.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { catalogAutoSortApplySchema } from '../../../../../shared/validators/catalog'

/** Apply audited category assignments from auto-sort review. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogAutoSortApplySchema)

  try {
    const result = await applyCatalogCategorySort(useDb(), body.assignments)

    await writeAudit(event, {
      entityType: 'catalog',
      entityId: body.assignments[0]!.itemId,
      action: 'catalog.ai.auto_sort',
      afterData: {
        updated: result.updated,
        assignmentCount: body.assignments.length,
      },
      permissionKey: 'catalog.manage.all',
    })

    return result
  }
  catch (err) {
    if (err instanceof CatalogAiServiceError) {
      if (err.code === 'EMPTY_SELECTION') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'INVALID_ASSIGNMENT') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
    }
    throw err
  }
})
