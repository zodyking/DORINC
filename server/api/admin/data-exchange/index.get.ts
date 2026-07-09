import { listDataExchangeTables } from '../../../services/data-exchange.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  return { items: await listDataExchangeTables(useDb()) }
})
