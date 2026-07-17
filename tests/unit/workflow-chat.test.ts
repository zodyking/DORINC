import { describe, expect, it } from 'vitest'
import { entityRefToken } from '../../server/services/messages.service'

describe('workflow chat message tokens', () => {
  it('builds service log handoff message with entity refs', () => {
    const body = [
      'Can you create',
      entityRefToken('invoice', '11111111-1111-4111-8111-111111111111', 'INV-000711'),
      'for',
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
      'using',
      entityRefToken('vehicle', '33333333-3333-4333-8333-333333333333', 'Unit 616'),
      'and',
      entityRefToken('service_log', '44444444-4444-4444-8444-444444444444', 'SL-1007'),
      '?',
    ].join(' ')

    expect(body).toContain('[[ref:invoice:')
    expect(body).toContain('[[ref:service_log:')
    expect(body).toContain('INV-000711')
  })

  it('builds invoice created message with entity refs', () => {
    const body = [
      entityRefToken('invoice', '11111111-1111-4111-8111-111111111111', 'INV-000711'),
      'has been created for',
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
    ].join(' ')

    expect(body).toContain('has been created for')
    expect(body).toContain('[[ref:customer:')
  })

  it('builds invoice sent message with entity refs', () => {
    const body = [
      entityRefToken('invoice', '11111111-1111-4111-8111-111111111111', 'INV-000711'),
      'has been sent to',
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
    ].join(' ')

    expect(body).toContain('has been sent to')
  })
})
