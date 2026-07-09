import { useDb } from '../../../db/client'
import { ensureDefaultInvoiceTemplate, getInvoiceTemplateDetail } from '../../../services/invoice-templates.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const { id } = validateParams(event, idParamSchema)

  const db = useDb()
  await ensureDefaultInvoiceTemplate(db)
  const detail = await getInvoiceTemplateDetail(db, id)
  if (!detail) throw apiError(event, 'NOT_FOUND', 'Invoice template not found')

  return detail
})
