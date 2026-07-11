import { readBuiltInInvoiceBladeSource } from '../../../utils/invoice-blade-baseline'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const source = await readBuiltInInvoiceBladeSource()
  return { source }
})
