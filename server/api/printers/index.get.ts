import { hasPermission, requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { printersPageQuerySchema } from '../../../shared/validators/printers'
import { printApiError, printersPage } from '../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.read.all')
  const query = validateQuery(event, printersPageQuerySchema)
  const canManage = hasPermission(event, 'printers.manage.all')
  // Driver options, mailbox, and tailnet views are settings screens.
  const page = canManage || query.tab === 'overview' || query.tab === 'jobs' ? query.tab : 'overview'
  try {
    return await printersPage(page, canManage)
  }
  catch (err) {
    throw printApiError(event, err, 'Could not load printers')
  }
})
