import {
  aiProviderSettingsAuditSnapshot,
  getAiProviderSettings,
  updateAiProviderSettings,
} from '../../../../services/ai-provider.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateBody } from '../../../../utils/validate'
import { aiProviderSettingsPatchSchema } from '../../../../../shared/validators/ai'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'ai.admin.all')
  const body = await validateBody(event, aiProviderSettingsPatchSchema)
  const db = useDb()
  const before = await getAiProviderSettings(db)

  try {
    const updated = await updateAiProviderSettings(db, body, user.id)

    try {
      await writeAudit(event, {
        entityType: 'ai_settings',
        entityId: updated.id,
        action: 'ai.settings.updated',
        beforeData: aiProviderSettingsAuditSnapshot(before),
        afterData: aiProviderSettingsAuditSnapshot(updated),
        permissionKey: 'ai.admin.all',
        riskLevel: 'sensitive',
      })
    }
    catch (auditErr) {
      console.error('[ai-settings] audit write failed:', (auditErr as Error).message)
    }

    return updated
  }
  catch (err) {
    const msg = (err as Error).message ?? 'Failed to save AI settings'
    if (msg.includes('ENCRYPTION_MASTER_KEY')) {
      throw apiError(
        event,
        'SERVICE_UNAVAILABLE',
        'Encryption is not configured. Complete Security setup in the Server Setup Wizard first.',
      )
    }
    throw apiError(event, 'INTERNAL_ERROR', msg)
  }
})
