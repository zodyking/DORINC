import { useDb } from '../../db/client'
import { exportInvoicesListCsv } from '../../services/invoices.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { invoiceExportQuerySchema } from '../../../shared/validators/invoices'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.read.all')
  const query = validateQuery(event, invoiceExportQuerySchema)
  const body = await exportInvoicesListCsv(useDb(), {
    q: query.q,
    status: query.status,
    overdue: query.overdue,
    customerId: query.customerId,
    vehicleId: query.vehicleId,
    includeArchived: query.includeArchived,
    amountMin: query.amountMin,
    amountMax: query.amountMax,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    sort: query.sort,
  })

  const stamp = new Date().toISOString().slice(0, 10)
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="invoices-${stamp}.csv"`)
  return body
})
