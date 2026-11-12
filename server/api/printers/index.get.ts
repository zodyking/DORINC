import { useDb } from '../../db/client'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { printersPageQuerySchema } from '../../../shared/validators/printers'
import { buildPrintersPage } from '../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.read.all')
  const query = validateQuery(event, printersPageQuerySchema)
  return buildPrintersPage(useDb(), query.tab)
})
