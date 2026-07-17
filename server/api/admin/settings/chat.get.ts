import { useDb } from '../../../db/client'
import { getChatWorkspaceSettings } from '../../../services/workspace-settings.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const settings = await getChatWorkspaceSettings(useDb())
  return { settings }
})
