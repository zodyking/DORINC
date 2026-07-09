import {
  AccountServiceError,
  changeAccountPassword,
} from '../../services/account.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { useDb } from '../../db/client'
import { accountPasswordSchema } from '../../../shared/validators/account'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user?: { id: string } } | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')

  const body = await validateBody(event, accountPasswordSchema)

  try {
    await changeAccountPassword(useDb(), auth.user.id, body.currentPassword, body.newPassword)

    await writeAudit(event, {
      entityType: 'user',
      entityId: auth.user.id,
      action: 'account.password.change',
      riskLevel: 'sensitive',
    })

    return { status: 'password_updated' }
  }
  catch (err) {
    if (err instanceof AccountServiceError && err.code === 'INVALID_PASSWORD') {
      throw apiError(event, 'UNAUTHENTICATED', 'Current password is incorrect')
    }
    throw err
  }
})
