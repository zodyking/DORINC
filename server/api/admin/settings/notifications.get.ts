import { useDb } from '../../../db/client'
import { getNotificationSettings } from '../../../services/workspace-settings.service'
import { requirePermission } from '../../../utils/require-permission'
import { NOTIFICATION_SETTING_META } from '../../../../shared/workspace-settings-defaults'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const settings = await getNotificationSettings(useDb())
  return {
    settings,
    meta: NOTIFICATION_SETTING_META,
  }
})
