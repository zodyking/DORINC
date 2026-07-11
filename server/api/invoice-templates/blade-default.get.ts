import { readBuiltInInvoiceBladeSource } from '../../services/laravel-pdf.service'
import { BLADE_INVOICE_TEMPLATE_VIEW } from '../../../shared/invoice-template-design'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const bladeSource = await readBuiltInInvoiceBladeSource()
  return {
    view: BLADE_INVOICE_TEMPLATE_VIEW,
    bladeSource,
  }
})
