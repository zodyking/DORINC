import { useDb } from '../../../db/client'
import { syncImapInbox } from '../../../services/imap-sync.service'
import { getImapConfig } from '../../../services/imap-config.service'
import { requirePermission } from '../../../utils/require-permission'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  if (!getImapConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'IMAP is not configured')
  }

  try {
    const result = await syncImapInbox(useDb(), { full: false })
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
