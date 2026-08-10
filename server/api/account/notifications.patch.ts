import {
  AccountServiceError,
  updateAccountNotificationPrefs,
} from '../../services/account.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { useDb } from '../../db/client'
import { accountNotificationPrefsSchema } from '../../../shared/validators/account'

function canManageTeamChat(accountType: string | undefined): boolean {
  return accountType === 'admin' || accountType === 'super_admin'
}

function canManageSilentDeveloperMode(accountType: string | undefined): boolean {
  return accountType === 'admin' || accountType === 'super_admin'
}

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as {
    user?: { id: string, accountType?: string }
  } | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  const body = await validateBody(event, accountNotificationPrefsSchema)

  if (body.teamChatEnabled !== undefined && !canManageTeamChat(auth.user.accountType)) {
    throw apiError(
      event,
      'FORBIDDEN',
      'Only admins can change team group chat membership',
    )
  }

  if (body.silentDeveloperMode !== undefined && !canManageSilentDeveloperMode(auth.user.accountType)) {
    throw apiError(
      event,
      'FORBIDDEN',
      'Only admins can change silent developer mode',
    )
  }

  try {
    const user = await updateAccountNotificationPrefs(useDb(), auth.user.id, body)

    await writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'account.notifications.update',
      afterData: {
        teamChatEnabled: user.teamChatEnabled,
        messageEmailNotify: user.messageEmailNotify,
        messageNotifyChannel: user.messageNotifyChannel,
        silentDeveloperMode: user.silentDeveloperMode,
      },
      changedFields: [
        ...(body.teamChatEnabled !== undefined ? ['teamChatEnabled'] : []),
        ...(body.messageEmailNotify !== undefined ? ['messageEmailNotify'] : []),
        ...(body.messageNotifyChannel !== undefined ? ['messageNotifyChannel'] : []),
        ...(body.silentDeveloperMode !== undefined ? ['silentDeveloperMode'] : []),
      ],
    })

    return {
      teamChatEnabled: user.teamChatEnabled,
      messageEmailNotify: user.messageEmailNotify,
      messageNotifyChannel: user.messageNotifyChannel,
      silentDeveloperMode: user.silentDeveloperMode,
    }
  }
  catch (err) {
    if (err instanceof AccountServiceError && err.code === 'SESSION_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Account not found')
    }
    if (err instanceof AccountServiceError && err.code === 'PHONE_REQUIRED') {
      throw apiError(
        event,
        'VALIDATION_ERROR',
        'Add a phone number on your profile before choosing Text notifications',
      )
    }
    throw err
  }
})
