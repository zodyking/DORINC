import { useDb } from '../../../../db/client'
import {
  applyCatalogAudit,
  CatalogAiServiceError,
} from '../../../../services/catalog-ai.service'
import { CatalogServiceError } from '../../../../services/catalog.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { catalogAuditApplySchema } from '../../../../../shared/validators/catalog'

/** Apply reviewed catalog audit fixes and duplicate archives. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogAuditApplySchema)

  try {
    const result = await applyCatalogAudit(useDb(), {
      fixes: body.fixes,
      duplicates: body.duplicates,
    })

    await writeAudit(event, {
      entityType: 'catalog',
      entityId: body.fixes[0]?.itemId
        ?? body.duplicates[0]?.keepItemId
        ?? null,
      action: 'catalog.ai.audit',
      afterData: {
        updated: result.updated,
        archived: result.archived,
        fixCount: body.fixes.length,
        duplicateGroups: body.duplicates.length,
      },
      permissionKey: 'catalog.manage.all',
    })

    return result
  }
  catch (err) {
    if (err instanceof CatalogAiServiceError) {
      if (err.code === 'EMPTY_SELECTION') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'INVALID_ASSIGNMENT') throw apiError(event, 'NOT_FOUND', err.message)
    }
    if (err instanceof CatalogServiceError && err.code === 'CATEGORY_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    throw err
  }
})
