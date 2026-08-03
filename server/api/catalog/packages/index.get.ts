import { listPackages } from '../../../services/catalog.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'
import { validateQuery } from '../../../utils/validate'
import { catalogPackageListQuerySchema } from '../../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.read.all')
  const query = validateQuery(event, catalogPackageListQuerySchema)
  return listPackages(useDb(), query)
})
