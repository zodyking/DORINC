import { useDb } from '../../db/client'
import { getTemplatePreviewInvoice } from '../../services/invoice-templates.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const preview = await getTemplatePreviewInvoice(useDb())
  return { preview }
})
