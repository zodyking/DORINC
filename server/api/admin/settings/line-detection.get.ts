import { useDb } from '../../../db/client'
import { getLineTypeVerbs } from '../../../services/workspace-settings.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const verbs = await getLineTypeVerbs(useDb())
  return { verbs }
})
