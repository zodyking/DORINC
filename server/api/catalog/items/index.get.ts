import { useDb } from '../../../db/client'
import { listCatalogItems } from '../../../services/catalog.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateQuery } from '../../../utils/validate'
import { catalogItemListQuerySchema } from '../../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.read.all')
  const query = validateQuery(event, catalogItemListQuerySchema)
  return listCatalogItems(useDb(), query)
})
