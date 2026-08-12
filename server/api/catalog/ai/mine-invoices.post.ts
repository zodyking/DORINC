import { useDb } from '../../../db/client'
import { mineCommonlyBilledFromInvoices } from '../../../services/catalog-ai.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogMineInvoicesSchema } from '../../../../shared/validators/catalog'

/** Detect commonly billed invoice lines missing from the catalog. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogMineInvoicesSchema)
  return mineCommonlyBilledFromInvoices(useDb(), {
    minOccurrences: body.minOccurrences,
    limit: body.limit,
    unlinkedOnly: body.unlinkedOnly,
  })
})
