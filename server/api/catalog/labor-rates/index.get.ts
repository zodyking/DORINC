import { useDb } from '../../db/client'
import { listLaborRates } from '../../services/catalog.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { catalogLaborRateListQuerySchema } from '../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.read.all')
  const query = validateQuery(event, catalogLaborRateListQuerySchema)
  return listLaborRates(useDb(), query)
})
