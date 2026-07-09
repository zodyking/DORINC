import {
  AccountServiceError,
  updateAccountProfile,
} from '../../services/account.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { useDb } from '../../db/client'
import { accountProfileSchema } from '../../../shared/validators/account'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user?: { id: string, name: string, email: string } } | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  const body = await validateBody(event, accountProfileSchema)

  try {
    const user = await updateAccountProfile(useDb(), auth.user.id, body)

    await writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'account.profile.update',
      beforeData: { name: auth.user.name, email: auth.user.email },
      afterData: { name: user.name, email: user.email },
      changedFields: ['name', 'email'],
    })

    return {
      user: { id: user.id, name: user.name, email: user.email },
    }
  }
  catch (err) {
    if (err instanceof AccountServiceError && err.code === 'EMAIL_TAKEN') {
      throw apiError(event, 'CONFLICT', 'An account with this email already exists')
    }
    throw err
  }
})
