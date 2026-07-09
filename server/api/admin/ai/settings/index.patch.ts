import { getAiProviderSettings, updateAiProviderSettings } from '../../../../services/ai-provider.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateBody } from '../../../../utils/validate'
import { aiProviderSettingsPatchSchema } from '../../../../../shared/validators/ai'
import { writeAudit } from '../../../../services/audit.service'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'ai.admin.all')
  const body = await validateBody(event, aiProviderSettingsPatchSchema)
  const db = useDb()
  const before = await getAiProviderSettings(db)
  const updated = await updateAiProviderSettings(db, body, user.id)

  await writeAudit(event, {
    entityType: 'ai_settings',
    entityId: updated.id,
    action: 'ai.settings.updated',
    beforeData: before,
    afterData: updated,
    permissionKey: 'ai.admin.all',
    riskLevel: 'sensitive',
  })

  return updated
})
