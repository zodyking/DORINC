import { useDb } from '../../db/client'
import { clearTeamChatHistory, TeamChatServiceError } from '../../services/team-chat.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateParams } from '../../utils/validate'
import { idParamSchema } from '../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.send.own')
  const { id } = validateParams(event, idParamSchema)

  try {
    return await clearTeamChatHistory(useDb(), id, user.id)
  }
  catch (err) {
    if (err instanceof TeamChatServiceError) {
      if (err.code === 'NOT_TEAM_CHAT') throw apiError(event, 'VALIDATION_ERROR', 'Only the team group chat history can be cleared this way')
      if (err.code === 'FORBIDDEN') throw apiError(event, 'FORBIDDEN', 'You are not in this conversation')
    }
    throw err
  }
})
