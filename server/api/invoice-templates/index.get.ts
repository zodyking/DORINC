import { useDb } from '../../db/client'
import { getDefaultInvoiceTemplate, getInvoiceTemplateDetail, listInvoiceTemplates } from '../../services/invoice-templates.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const db = useDb()
  const query = getQuery(event)

  if (query.default === 'true' || query.default === '1') {
    const template = await getDefaultInvoiceTemplate(db)
    if (!template) throw apiError(event, 'NOT_FOUND', 'No default invoice template')
    const detail = await getInvoiceTemplateDetail(db, template.id)
    return detail
  }

  const items = await listInvoiceTemplates(db)
  return { items }
})
