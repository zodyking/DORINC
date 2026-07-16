import { useDb } from '../../../db/client'
import { syncImapInbox } from '../../../services/imap-sync.service'
import { getImapConfig, refreshImapConfigCache } from '../../../services/imap-config.service'
import { refreshAppConfigCache } from '../../../services/app-config.service'
import { requirePermission } from '../../../utils/require-permission'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()
  await refreshAppConfigCache(db)
  await refreshImapConfigCache(db)
  if (!getImapConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'IMAP is not configured')
  }

  try {
    const result = await syncImapInbox(db, { full: false })
    return {
      ok: true,
      message: `Synced ${result.ingested} new message(s) (${result.skipped} skipped, ${result.errors} errors)`,
      result,
    }
  }
  catch (err) {
    throw apiError(event, 'VALIDATION_ERROR', (err as Error).message || 'IMAP sync failed')
  }
})
