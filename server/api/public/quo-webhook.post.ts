import { useDb } from '../../db/client'
import {
  getQuoWebhookSigningKey,
  processQuoInboundSusanSms,
  verifyAndParseQuoWebhook,
} from '../../services/quo-webhook.service'

/**
 * Quo webhook: new SMS → identify sender → active text user → Susan AI → reply SMS.
 * Returns 200 immediately so Quo does not time out while AI runs.
 */
export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty webhook body' })
  }

  const webhookKey = await getQuoWebhookSigningKey(useDb())
  if (!webhookKey) {
    throw createError({ statusCode: 503, statusMessage: 'Quo webhook is not configured' })
  }

  const verified = verifyAndParseQuoWebhook({
    rawBody,
    webhookKey,
    webhookId: getHeader(event, 'webhook-id') || '',
    webhookTimestamp: getHeader(event, 'webhook-timestamp') || '',
    webhookSignature: getHeader(event, 'webhook-signature') || '',
  })

  if (!verified.ok) {
    if (verified.reason === 'invalid_signature') {
      throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature' })
    }
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  if (verified.ignored) {
    return { ok: true, ignored: true, reason: verified.reason }
  }

  // 1) Detected new inbound SMS — process the simple pipeline in background.
  const parsed = verified.parsed
  void processQuoInboundSusanSms(useDb(), parsed).catch((err) => {
    console.error('[quo-webhook] pipeline failed:', err instanceof Error ? err.message : err)
  })

  return { ok: true, accepted: true, messageId: parsed.messageId }
})
