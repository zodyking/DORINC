import { z } from 'zod'
import { useDb } from '../../../db/client'
import { saveCatalogKeywordMap } from '../../../services/workspace-settings.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogKeywordMapSchema } from '../../../../shared/validators/workspace-settings'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, z.object({ keywords: catalogKeywordMapSchema }))
  const keywords = await saveCatalogKeywordMap(useDb(), body.keywords, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.catalog_detection.update',
    permissionKey: 'system.admin.all',
  })

  return { keywords }
})
