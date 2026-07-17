import { useDb } from '../../db/client'
import { getStaffInvoiceDefaults } from '../../services/workspace-settings.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.read.all')
  return getStaffInvoiceDefaults(useDb())
})
