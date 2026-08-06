import { useDb } from '../../db/client'
import { listEmailTemplates } from '../../services/email-templates.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const db = useDb()
  try {
    const items = await listEmailTemplates(db)
    return { items }
  }
  catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
    console.error('[email-templates] list failed:', err)
    throw apiError(event, 'INTERNAL_ERROR', 'Could not load email templates')
  }
})
