import { useDb } from '../../../db/client'
import { postDocumentPrintedTeamMessage } from '../../../services/workflow-chat.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission, type AuthContext } from '../../../utils/require-permission'

/** Team chat (+ email) when the blank service log sheet is printed locally. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const canPrint = hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.create.all')
    || hasPermission(event, 'staples.print.all')
  if (!canPrint) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to print the service log sheet')
  }

  await postDocumentPrintedTeamMessage(useDb(), {
    senderUserId: auth.user.id,
    documentLabel: 'Blank service log sheet',
  })

  return { ok: true }
})
