import { getAiProviderSettings, getSpendCapStatus } from '../../../../services/ai-provider.service'
import { getAiUsageSummary } from '../../../../services/ai-jobs.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'ai.admin.all')
  const db = useDb()
  const [settings, usage, spendCaps] = await Promise.all([
    getAiProviderSettings(db),
    getAiUsageSummary(db),
    getSpendCapStatus(db),
  ])
  return { settings, usage, spendCaps }
})
