import { useDb } from '../../../db/client'
import { proposeCatalogCategorySort } from '../../../services/catalog-ai.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogAutoSortProposeSchema } from '../../../../shared/validators/catalog'

/** Propose category assignments for catalog items (keyword / Catalog Detection). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogAutoSortProposeSchema)
  return proposeCatalogCategorySort(useDb(), {
    uncategorizedOnly: body.uncategorizedOnly,
  })
})
