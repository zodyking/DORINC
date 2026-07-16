import { useDb } from '../../../db/client'
import { markConversationRead } from '../../../services/messages.service'
import { getConversationType, markEmailConversationRead } from '../../../services/email-inbox.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { apiError } from '../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.read.own')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  const type = await getConversationType(db, id)
  if (!type) throw apiError(event, 'NOT_FOUND', 'Conversation not found')

  if (type === 'email') {
    await markEmailConversationRead(db, id, user.id)
    return { lastReadAt: new Date() }
  }

  return markConversationRead(db, id, user.id)
})
