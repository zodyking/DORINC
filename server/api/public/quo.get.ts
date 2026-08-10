import { useDb } from '../../db/client'
import { getQuoSettingsView, refreshQuoConfigCache } from '../../services/quo.service'
import type { QuoPublicStatus } from '../../../shared/validators/quo'

export default defineEventHandler(async (): Promise<QuoPublicStatus> => {
  const db = useDb()
  try {
    await refreshQuoConfigCache(db)
    const view = await getQuoSettingsView(db)
    return { enabled: view.enabled }
  }
  catch {
    return { enabled: false }
  }
})
