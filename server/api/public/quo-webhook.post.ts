import { useDb } from '../../db/client'
import {
  getQuoWebhookSigningKey,
  processQuoInboundSusanSms,
  verifyAndParseQuoWebhook,
} from '../../services/quo-webhook.service'

/**
 * Quo inbound webhook (message.received) → Susan AI SMS chat for text-enabled staff.
 * Responds immediately after signature verification so Quo doesn't time out while
 * OpenRouter generates Susan's reply.
 */
export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty webhook body' })
  }

  const webhookKey = await getQuoWebhookSigningKey(useDb())
  if (!webhookKey) {
    console.warn('[quo-webhook] rejected: webhook signing key not configured')
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
      console.warn('[quo-webhook] rejected: invalid signature')
      throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature' })
    }
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  if (verified.ignored) {
    return { ok: true, ignored: true, reason: verified.reason }
  }

  const parsed = verified.parsed
  // Acknowledge delivery immediately — AI reply continues in background.
  const db = useDb()
  void processQuoInboundSusanSms(db, parsed).catch((err) => {
    console.error('[quo-webhook] background process failed:', err instanceof Error ? err.message : err)
  })

  return {
    ok: true,
    accepted: true,
    messageId: parsed.messageId,
  }
})
