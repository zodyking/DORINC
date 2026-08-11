import type { Db } from '../db/client'
import {
  isQuoInboundDirection,
  parseQuoMessageReceivedPayload,
} from '../../shared/quo-webhook-payload'
import { getQuoConfig, verifyQuoWebhookSignature } from './quo.service'
import { handleInboundSusanSms } from './susan-sms.service'

export function verifyAndParseQuoWebhook(input: {
  rawBody: string
  webhookKey: string
  webhookId: string
  webhookTimestamp: string
  webhookSignature: string
}) {
  const ok = verifyQuoWebhookSignature({
    webhookKey: input.webhookKey,
    webhookId: input.webhookId,
    webhookTimestamp: input.webhookTimestamp,
    webhookSignature: input.webhookSignature,
    rawBody: input.rawBody,
  })
  if (!ok) return { ok: false as const, reason: 'invalid_signature' as const }

  let payload: unknown
  try {
    payload = JSON.parse(input.rawBody)
  }
  catch {
    return { ok: false as const, reason: 'invalid_json' as const }
  }

  const parsed = parseQuoMessageReceivedPayload(payload)
  if (parsed.rawType && parsed.rawType !== 'message.received') {
    return { ok: true as const, ignored: true as const, reason: 'wrong_type' as const, parsed }
  }
  if (!isQuoInboundDirection(parsed.direction)) {
    return { ok: true as const, ignored: true as const, reason: 'not_inbound' as const, parsed }
  }
  return { ok: true as const, ignored: false as const, parsed }
}

/**
 * Process an inbound Quo SMS for Susan. Intended to run after the webhook
 * HTTP response is already on its way (fire-and-forget).
 */
export async function processQuoInboundSusanSms(
  db: Db,
  parsed: ReturnType<typeof parseQuoMessageReceivedPayload>,
) {
  const started = Date.now()
  try {
    const result = await handleInboundSusanSms(db, {
      fromPhone: parsed.fromPhone ?? '',
      toPhone: parsed.toPhone,
      body: parsed.body,
      messageId: parsed.messageId,
    })
    console.info('[quo-webhook] susan sms', {
      handled: result.handled,
      reason: result.reason,
      ms: Date.now() - started,
      from: parsed.fromPhone,
      messageId: parsed.messageId,
    })
    return result
  }
  catch (err) {
    console.error(
      '[quo-webhook] susan sms failed:',
      err instanceof Error ? err.message : err,
      { ms: Date.now() - started, from: parsed.fromPhone, messageId: parsed.messageId },
    )
    throw err
  }
}

export async function getQuoWebhookSigningKey(db: Db): Promise<string | null> {
  const config = await getQuoConfig(db)
  return config.webhookKey?.trim() || null
}
