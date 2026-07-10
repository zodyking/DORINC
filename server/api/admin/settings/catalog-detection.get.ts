import { useDb } from '../../../db/client'
import { getCatalogKeywordMap, saveCatalogKeywordMap } from '../../../services/workspace-settings.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogKeywordMapSchema } from '../../../../shared/validators/workspace-settings'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const keywords = await getCatalogKeywordMap(useDb())
  return { keywords }
})
