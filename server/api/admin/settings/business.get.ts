import { useDb } from '../../../db/client'
import { getBusinessProfile } from '../../../services/workspace-settings.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const profile = await getBusinessProfile(useDb())
  return { profile }
})
