import { useDb } from '../../../db/client'
import {
  getBillingIntegrations,
  revealBillingPortalCredentials,
} from '../../../services/billing-integrations.service'
import { getQuoConfig, revealQuoPortalCredentials } from '../../../services/quo.service'
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

  let hasCredentials: boolean
  if (body.provider === 'quo') {
    const quo = await getQuoConfig(db)
    hasCredentials = Boolean(quo.portalUsername?.trim() || quo.portalPassword?.trim())
  }
  else {
    const settings = await getBillingIntegrations(db)
    hasCredentials = body.provider === 'vultr'
      ? settings.hasVultrUsername || settings.hasVultrPassword
      : body.provider === 'cloudflare'
        ? settings.hasCloudflareUsername || settings.hasCloudflarePassword
        : settings.hasOpenrouterUsername || settings.hasOpenrouterPassword
  }

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

  const credentials = body.provider === 'quo'
    ? await revealQuoPortalCredentials(db)
    : await revealBillingPortalCredentials(db, body.provider)

  return {
    provider: body.provider,
    username: credentials.username,
    password: credentials.password,
  }
})
