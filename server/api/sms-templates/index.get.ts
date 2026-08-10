import { useDb } from '../../db/client'
import { listSmsTemplates } from '../../services/sms-templates.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const items = await listSmsTemplates(useDb())
  return { items }
})
