import { useDb } from '../../db/client'
import { listInvoices } from '../../services/invoices.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { invoiceListQuerySchema } from '../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.read.all')
  const query = validateQuery(event, invoiceListQuerySchema)

  return listInvoices(useDb(), {
    q: query.q,
    status: query.status,
    customerId: query.customerId,
    vehicleId: query.vehicleId,
    includeArchived: query.includeArchived,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  })
})
