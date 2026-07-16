import { testImapConnection } from '../../../services/imap-sync.service'
import { getImapConfig } from '../../../services/imap-config.service'
import { requirePermission } from '../../../utils/require-permission'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  if (!getImapConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'Save IMAP settings before testing the connection')
  }

  try {
    const result = await testImapConnection()
    return {
      ok: true,
      message: `Connected to ${result.mailbox} (${result.messageCount} messages)`,
    }
  }
  catch (err) {
    throw apiError(event, 'VALIDATION_ERROR', (err as Error).message || 'IMAP connection failed')
  }
})
