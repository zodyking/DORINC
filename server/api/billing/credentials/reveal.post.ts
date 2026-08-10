import { useDb } from '../../../db/client'
import {
  getBillingIntegrations,
  revealBillingPortalCredentials,
} from '../../../services/billing-integrations.service'
import { StepUpError, verifyStepUp } from '../../../services/step-up.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { billingCredentialsRevealSchema } from '../../../../shared/validators/billing-integrations'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'billing.read.all')
  const body = await validateBody(event, billingCredentialsRevealSchema)
  const auth = event.context.auth as { sessionId?: string, stepUpVerifiedAt?: Date | null } | undefined
  if (!auth?.sessionId) {
    throw apiError(event, 'UNAUTHENTICATED', 'Session required')
  }

  const db = useDb()
  if (body.provider === 'quo') {
    throw apiError(event, 'NOT_FOUND', 'Quo credentials are managed in Control Panel → Quo SMS')
  }

  const settings = await getBillingIntegrations(db)
  const hasCredentials = body.provider === 'vultr'
    ? settings.hasVultrUsername || settings.hasVultrPassword
    : body.provider === 'cloudflare'
      ? settings.hasCloudflareUsername || settings.hasCloudflarePassword
      : settings.hasOpenrouterUsername || settings.hasOpenrouterPassword

  if (!hasCredentials) {
    throw apiError(event, 'NOT_FOUND', 'No portal credentials saved for this provider')
  }

  try {
    const verifiedAt = await verifyStepUp(db, user.id, auth.sessionId, body.password)
    auth.stepUpVerifiedAt = verifiedAt
  }
  catch (e) {
    if (e instanceof StepUpError && e.code === 'INVALID_PASSWORD') {
      throw apiError(event, 'FORBIDDEN', 'Incorrect account password')
    }
    throw apiError(event, 'FORBIDDEN', 'Could not verify account password')
  }

  const credentials = await revealBillingPortalCredentials(db, body.provider)
  return {
    provider: body.provider,
    username: credentials.username,
    password: credentials.password,
  }
})
