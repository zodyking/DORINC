import { useDb } from '../../../../db/client'
import { CatalogServiceError, getCatalogItem } from '../../../../services/catalog.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.read.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const item = await getCatalogItem(useDb(), id)
    return { item }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
    }
    throw err
  }
})
