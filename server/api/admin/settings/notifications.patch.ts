import { useDb } from '../../../db/client'
import { saveNotificationSettings } from '../../../services/workspace-settings.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { notificationSettingsSchema } from '../../../../shared/validators/workspace-settings'
import { NOTIFICATION_SETTING_META } from '../../../../shared/workspace-settings-defaults'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, notificationSettingsSchema)
  const settings = await saveNotificationSettings(useDb(), body, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.notifications.update',
    afterData: settings,
    permissionKey: 'system.admin.all',
  })

  return {
    settings,
    meta: NOTIFICATION_SETTING_META,
  }
})
