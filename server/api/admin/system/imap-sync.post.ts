import { readBody } from 'h3'
import { useDb } from '../../../db/client'
import { enqueueJob } from '../../../services/jobs.service'
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

  // Run the sync in the background worker instead of inline so large mailboxes
  // (and attachment backfills) never time out the request. Emails + attachments
  // appear as the worker processes the job.
  try {
    await enqueueJob(db, 'imap_sync', { trigger: 'manual', full }, 3)
    return {
      ok: true,
      message: full
        ? 'Full sync started in the background — new emails and attachment backfill will appear in a moment. Refresh to see updates.'
        : 'Sync started in the background — new emails will appear in a moment. Refresh to see updates.',
    }
  }
  catch (err) {
    throw apiError(event, 'VALIDATION_ERROR', (err as Error).message || 'Could not start IMAP sync')
  }
})
