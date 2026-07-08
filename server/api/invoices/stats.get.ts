import { useDb } from '../../db/client'
import { getInvoiceListStats } from '../../services/invoices.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.read.all')
  return getInvoiceListStats(useDb())
})
