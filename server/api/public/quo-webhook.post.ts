import { useDb } from '../../db/client'
import {
  getQuoConfig,
  verifyQuoWebhookSignature,
} from '../../services/quo.service'
import { handleInboundSusanSms } from '../../services/susan-sms.service'

/**
 * Quo inbound webhook (message.received) → Susan AI SMS chat for text-enabled staff.
 */
export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty webhook body' })
  }

  const config = await getQuoConfig(useDb())
  if (!config.webhookKey) {
    throw createError({ statusCode: 503, statusMessage: 'Quo webhook is not configured' })
  }

  const webhookId = getHeader(event, 'webhook-id') || ''
  const webhookTimestamp = getHeader(event, 'webhook-timestamp') || ''
  const webhookSignature = getHeader(event, 'webhook-signature') || ''

  const ok = verifyQuoWebhookSignature({
    webhookKey: config.webhookKey,
    webhookId,
    webhookTimestamp,
    webhookSignature,
    rawBody,
  })
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature' })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  const type = String(payload.type ?? payload.event ?? '')
  if (type && type !== 'message.received') {
    return { ok: true, ignored: true, type }
  }

  const data = (payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : payload) as Record<string, unknown>
  const object = (data.object && typeof data.object === 'object'
    ? data.object as Record<string, unknown>
    : data)

  const direction = String(object.direction ?? '').toLowerCase()
  if (direction && direction !== 'incoming' && direction !== 'inbound') {
    return { ok: true, ignored: true, reason: 'not_inbound' }
  }

  const from = String(object.from ?? object.fromPhoneNumber ?? '')
  const to = String(object.to ?? object.toPhoneNumber ?? '')
  const body = String(object.body ?? object.content ?? object.text ?? '')
  const messageId = object.id != null ? String(object.id) : null

  // Some Quo payloads nest `to` as an array.
  const toPhone = Array.isArray(object.to)
    ? String(object.to[0] ?? '')
    : to

  try {
    const result = await handleInboundSusanSms(useDb(), {
      fromPhone: from,
      toPhone,
      body,
      messageId,
    })
    return { ok: true, ...result }
  }
  catch (err) {
    console.error('[quo-webhook] Susan SMS handle failed:', err instanceof Error ? err.message : err)
    // Acknowledge to avoid Quo retry storms; reply already may have failed.
    return { ok: false, error: 'handler_failed' }
  }
})
