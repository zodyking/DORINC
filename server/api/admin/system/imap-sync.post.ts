import { readBody } from 'h3'
import { useDb } from '../../../db/client'
import { syncImapInbox } from '../../../services/imap-sync.service'
import { getImapConfig, refreshImapConfigCache } from '../../../services/imap-config.service'
import { refreshAppConfigCache } from '../../../services/app-config.service'
import { requirePermission } from '../../../utils/require-permission'
import { apiError } from '../../../utils/api-error'
import { z } from 'zod'

const bodySchema = z.object({
  full: z.boolean().optional(),
}).optional()

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()
  await refreshAppConfigCache(db)
  await refreshImapConfigCache(db)
  if (!getImapConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'IMAP is not configured')
  }

  const body = bodySchema.safeParse(await readBody(event).catch(() => undefined))
  const full = body.success ? body.data?.full === true : false

  try {
    const result = await syncImapInbox(db, { full })
    const repairNote = result.repaired ? `, repaired ${result.repaired} attachment(s) on existing message(s)` : ''
    return {
      ok: true,
      message: `Synced ${result.ingested} new message(s) (${result.skipped} skipped, ${result.errors} errors${repairNote})`,
      result,
    }
  }
  catch (err) {
    throw apiError(event, 'VALIDATION_ERROR', (err as Error).message || 'IMAP sync failed')
  }
})
