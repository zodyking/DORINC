import { describe, expect, it } from 'vitest'
import { parseQuoMessageReceivedPayload } from '../../shared/quo-webhook-payload'

describe('susan sms simple pipeline contract', () => {
  it('detects sender + body from a Quo message.received event', () => {
    const parsed = parseQuoMessageReceivedPayload({
      type: 'message.received',
      data: {
        resource: {
          id: 'AC1',
          direction: 'incoming',
          text: 'How do I create an invoice?',
        },
        context: {
          senderIdentifier: '+15555550111',
          recipientIdentifiers: ['+15165184847'],
        },
      },
    })

    // Pipeline inputs: who sent it + what they asked
    expect(parsed.fromPhone).toBe('+15555550111')
    expect(parsed.body).toBe('How do I create an invoice?')
    expect(parsed.messageId).toBe('AC1')
  })
})
