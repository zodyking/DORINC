import { StepUpError, verifyStepUp } from '../../services/step-up.service'
import { writeAudit } from '../../services/audit.service'
import { useDb } from '../../db/client'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { stepUpVerifySchema } from '../../../shared/validators/security'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as {
    user?: { id: string, name: string, email: string, accountType: string }
    sessionId?: string
  } | undefined

  if (!auth?.user || !auth.sessionId) {
    throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')
  }

  const { password } = await validateBody(event, stepUpVerifySchema)

  try {
    const verifiedAt = await verifyStepUp(useDb(), auth.user.id, auth.sessionId, password)
    auth.stepUpVerifiedAt = verifiedAt

    await writeAudit(event, {
      entityType: 'user',
      entityId: auth.user.id,
      action: 'auth.step_up',
      actor: {
        id: auth.user.id,
        name: auth.user.name,
        email: auth.user.email,
        accountType: auth.user.accountType,
      },
      riskLevel: 'sensitive',
    })

    return {
      verified: true,
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: new Date(verifiedAt.getTime() + 10 * 60 * 1000).toISOString(),
    }
  }
  catch (err) {
    if (err instanceof StepUpError && err.code === 'INVALID_PASSWORD') {
      throw apiError(event, 'UNAUTHENTICATED', 'Password is incorrect')
    }
    throw err
  }
})
