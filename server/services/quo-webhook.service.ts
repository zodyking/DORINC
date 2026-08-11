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
 * Run the simple Susan SMS pipeline after webhook detection:
 * who sent it → active text user → AI → Quo reply.
 */
export async function processQuoInboundSusanSms(
  db: Db,
  parsed: ReturnType<typeof parseQuoMessageReceivedPayload>,
) {
  const started = Date.now()
  console.info('[quo-webhook] detected sms', {
    from: parsed.fromPhone,
    to: parsed.toPhone,
    messageId: parsed.messageId,
    bodyPreview: parsed.body.slice(0, 80),
  })

  const result = await handleInboundSusanSms(db, {
    fromPhone: parsed.fromPhone ?? '',
    toPhone: parsed.toPhone,
    body: parsed.body,
    messageId: parsed.messageId,
  })

  console.info('[quo-webhook] pipeline done', {
    ...result,
    ms: Date.now() - started,
    from: parsed.fromPhone,
    messageId: parsed.messageId,
  })
  return result
}

export async function getQuoWebhookSigningKey(db: Db): Promise<string | null> {
  const config = await getQuoConfig(db)
  return config.webhookKey?.trim() || null
}
