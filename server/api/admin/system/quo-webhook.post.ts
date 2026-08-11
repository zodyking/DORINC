import { useDb } from '../../../db/client'
import {
  ensureQuoInboundWebhook,
  getQuoConfig,
  isQuoSmsEnabled,
  refreshQuoConfigCache,
} from '../../../services/quo.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'

/** Force re-register the Susan SMS inbound webhook with Quo. */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'system.admin.all')
  const db = useDb()
  await refreshQuoConfigCache(db)
  const config = await getQuoConfig(db)
  if (!isQuoSmsEnabled(config)) {
    throw apiError(event, 'VALIDATION_ERROR', 'Enable Quo SMS and save the API key + from-number first')
  }

  try {
    const view = await ensureQuoInboundWebhook(db, actor.id, { force: true })
    return {
      ok: true,
      webhookConfigured: view.webhookConfigured,
      webhookUrl: view.webhookUrl,
      message: view.webhookConfigured
        ? 'Susan SMS webhook registered'
        : 'Webhook registration did not complete',
    }
  }
  catch (err) {
    throw apiError(
      event,
      'UPSTREAM_ERROR',
      err instanceof Error ? err.message : 'Could not register Quo webhook',
    )
  }
})
