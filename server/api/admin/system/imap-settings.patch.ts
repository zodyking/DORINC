import { useDb } from '../../../db/client'
import {
  getImapConfig,
  saveImapConfig,
  saveImapFilters,
  clearImapConfigCache,
} from '../../../services/imap-config.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { imapSettingsPatchSchema } from '../../../../shared/validators/email-inbox'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, imapSettingsPatchSchema)
  const db = useDb()

  const existing = getImapConfig()

  try {
    await saveImapConfig(db, {
      host: body.host,
      port: body.port,
      user: body.username,
      pass: body.password ?? existing?.pass ?? '',
      mailbox: body.mailbox,
      useTls: body.useTls,
    }, auth.user.id)

    await saveImapFilters(db, body.filters, auth.user.id)
    clearImapConfigCache()
    await refreshImapConfigCache(db)

    await writeAudit(event, {
      entityType: 'system',
      action: 'settings.imap.update',
      afterData: { host: body.host, port: body.port, mailbox: body.mailbox },
      permissionKey: 'system.admin.all',
      riskLevel: 'high',
    })

    return { ok: true, message: 'IMAP settings updated' }
  }
  catch (err) {
    const msg = (err as Error).message
    if (msg.includes('locked by environment')) {
      throw apiError(event, 'CONFLICT', 'IMAP is locked by environment variables on this server')
    }
    throw apiError(event, 'VALIDATION_ERROR', msg)
  }
})

async function refreshImapConfigCache(db: ReturnType<typeof useDb>) {
  const { refreshImapConfigCache } = await import('../../../services/imap-config.service')
  await refreshImapConfigCache(db)
}
