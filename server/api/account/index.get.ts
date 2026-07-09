import { getAccountDetail } from '../../services/account.service'
import { apiError } from '../../utils/api-error'
import { useDb } from '../../db/client'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as {
    user?: { id: string, accountType: string, name: string, email: string }
    sessionId?: string
  } | undefined

  if (!auth?.user || !auth.sessionId) {
    throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')
  }

  const detail = await getAccountDetail(useDb(), auth.user.id, auth.sessionId)
  if (!detail) throw apiError(event, 'NOT_FOUND', 'Account not found')

  return {
    account: {
      ...detail,
      accountType: auth.user.accountType,
    },
  }
})
