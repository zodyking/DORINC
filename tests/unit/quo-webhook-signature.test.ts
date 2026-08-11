import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyQuoWebhookSignature } from '../../server/services/quo.service'

function sign(secretWhsec: string, id: string, ts: string, body: string) {
  const secretBase64 = secretWhsec.startsWith('whsec_') ? secretWhsec.slice(6) : secretWhsec
  const key = Buffer.from(secretBase64, 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return `v1,${expected}`
}

describe('verifyQuoWebhookSignature', () => {
  it('accepts a valid signature', () => {
    const keyBytes = crypto.randomBytes(32)
    const webhookKey = `whsec_${keyBytes.toString('base64')}`
    const webhookId = 'msg_123'
    const webhookTimestamp = String(Math.floor(Date.now() / 1000))
    const rawBody = '{"type":"message.received"}'
    const webhookSignature = sign(webhookKey, webhookId, webhookTimestamp, rawBody)

    expect(verifyQuoWebhookSignature({
      webhookKey,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      rawBody,
    })).toBe(true)
  })

  it('rejects a bad signature', () => {
    expect(verifyQuoWebhookSignature({
      webhookKey: 'whsec_YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
      webhookId: 'msg_123',
      webhookTimestamp: String(Math.floor(Date.now() / 1000)),
      webhookSignature: 'v1,not-valid',
      rawBody: '{}',
    })).toBe(false)
  })
})
