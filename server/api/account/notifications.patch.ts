import {
  AccountServiceError,
  updateAccountNotificationPrefs,
} from '../../services/account.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { useDb } from '../../db/client'
import { accountNotificationPrefsSchema } from '../../../shared/validators/account'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user?: { id: string } } | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  const body = await validateBody(event, accountNotificationPrefsSchema)

  try {
    const user = await updateAccountNotificationPrefs(useDb(), auth.user.id, body)

    await writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'account.notifications.update',
      afterData: {
        teamChatEnabled: user.teamChatEnabled,
        messageEmailNotify: user.messageEmailNotify,
      },
      changedFields: [
        ...(body.teamChatEnabled !== undefined ? ['teamChatEnabled'] : []),
        ...(body.messageEmailNotify !== undefined ? ['messageEmailNotify'] : []),
      ],
    })

    return {
      teamChatEnabled: user.teamChatEnabled,
      messageEmailNotify: user.messageEmailNotify,
    }
  }
  catch (err) {
    if (err instanceof AccountServiceError && err.code === 'SESSION_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Account not found')
    }
    throw err
  }
})
