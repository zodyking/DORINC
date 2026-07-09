import { getPlatformHelpStatus } from '../../services/platform-help.service'
import { requirePermission } from '../../utils/require-permission'
import { useDb } from '../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'ai.help.all')
  return getPlatformHelpStatus(useDb())
})
