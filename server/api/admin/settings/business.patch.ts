import { useDb } from '../../../db/client'
import { saveBusinessProfile } from '../../../services/workspace-settings.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { businessProfileSchema } from '../../../../shared/validators/workspace-settings'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, businessProfileSchema)
  const profile = await saveBusinessProfile(useDb(), body, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.business.update',
    afterData: { tradeName: profile.tradeName },
    permissionKey: 'system.admin.all',
  })

  return { profile }
})
