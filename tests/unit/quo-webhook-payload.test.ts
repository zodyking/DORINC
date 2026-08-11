import { describe, expect, it } from 'vitest'
import {
  isQuoInboundDirection,
  parseQuoMessageReceivedPayload,
} from '../../shared/quo-webhook-payload'

describe('parseQuoMessageReceivedPayload', () => {
  it('parses the 2026-03-30 resource/context shape', () => {
    const parsed = parseQuoMessageReceivedPayload({
      id: 'EV123',
      type: 'message.received',
      data: {
        resource: {
          id: 'AC-message',
          direction: 'incoming',
          text: 'Susan?',
          media: [],
          status: 'received',
        },
        context: {
          senderIdentifier: '+15555550111',
          recipientIdentifiers: ['+15165184847'],
        },
      },
    })

    expect(parsed.rawType).toBe('message.received')
    expect(parsed.body).toBe('Susan?')
    expect(parsed.fromPhone).toBe('+15555550111')
    expect(parsed.toPhone).toBe('+15165184847')
    expect(parsed.messageId).toBe('AC-message')
    expect(isQuoInboundDirection(parsed.direction)).toBe(true)
  })

  it('parses legacy data.object payloads', () => {
    const parsed = parseQuoMessageReceivedPayload({
      type: 'message.received',
      data: {
        object: {
          id: 'ACold',
          direction: 'incoming',
          from: '+14155550100',
          to: ['+13105550199'],
          body: 'Hello',
        },
      },
    })

    expect(parsed.body).toBe('Hello')
    expect(parsed.fromPhone).toBe('+14155550100')
    expect(parsed.toPhone).toBe('+13105550199')
    expect(parsed.messageId).toBe('ACold')
  })

  it('treats missing direction as inbound', () => {
    expect(isQuoInboundDirection(null)).toBe(true)
    expect(isQuoInboundDirection('outgoing')).toBe(false)
  })
})
