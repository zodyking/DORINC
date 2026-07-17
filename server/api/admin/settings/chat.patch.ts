import { useDb } from '../../../db/client'
import { saveChatWorkspaceSettings } from '../../../services/workspace-settings.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { chatWorkspaceSettingsSchema } from '../../../../shared/validators/workspace-settings'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, chatWorkspaceSettingsSchema)
  const settings = await saveChatWorkspaceSettings(useDb(), body, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.chat.update',
    afterData: settings,
    permissionKey: 'system.admin.all',
  })

  return { settings }
})
