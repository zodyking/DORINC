import { useDb } from '../../../../db/client'
import { AccountServiceError } from '../../../../services/account.service'
import { updateUserCommunicationPrefs, UsersServiceError } from '../../../../services/users.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { accountNotificationPrefsSchema } from '../../../../../shared/validators/account'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'users.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, accountNotificationPrefsSchema)
  const db = useDb()

  try {
    const result = await updateUserCommunicationPrefs(db, {
      userId: id,
      actor: { id: actor.id, accountType: actor.accountType },
      teamChatEnabled: body.teamChatEnabled,
      messageEmailNotify: body.messageEmailNotify,
      messageNotifyChannel: body.messageNotifyChannel,
      silentDeveloperMode: body.silentDeveloperMode,
    })

    if (result.changedFields.length) {
      await writeAudit(event, {
        entityType: 'user',
        entityId: id,
        action: 'users.notifications.update',
        beforeData: result.previous,
        afterData: {
          teamChatEnabled: result.user.teamChatEnabled,
          messageEmailNotify: result.user.messageEmailNotify,
          messageNotifyChannel: result.user.messageNotifyChannel === 'sms' ? 'sms' : 'email',
          silentDeveloperMode: result.user.silentDeveloperMode,
        },
        changedFields: result.changedFields,
        permissionKey: 'users.manage.all',
        riskLevel: 'sensitive',
      })
    }

    return {
      status: 'updated',
      channelChanged: result.channelChanged,
      teamChatEnabled: result.user.teamChatEnabled,
      messageEmailNotify: result.user.messageEmailNotify,
      messageNotifyChannel: result.user.messageNotifyChannel === 'sms' ? 'sms' : 'email',
      silentDeveloperMode: result.user.silentDeveloperMode,
    }
  }
  catch (err) {
    if (err instanceof UsersServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'User not found')
      if (err.code === 'INVALID_ACCOUNT_TYPE') {
        throw apiError(event, 'VALIDATION_ERROR', 'Communication settings are only available for staff users')
      }
      if (err.code === 'SUPER_ADMIN_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Super Admin accounts cannot be modified this way')
      }
      if (err.code === 'SUSAN_PROTECTED') {
        throw apiError(event, 'FORBIDDEN', 'Susan’s system account cannot be edited')
      }
    }
    if (err instanceof AccountServiceError && err.code === 'PHONE_REQUIRED') {
      throw apiError(
        event,
        'VALIDATION_ERROR',
        'Add a phone number on this user before choosing Text notifications',
      )
    }
    if (err instanceof AccountServiceError && err.code === 'SESSION_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'User not found')
    }
    throw err
  }
})
