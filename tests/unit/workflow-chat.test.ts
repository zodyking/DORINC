import { describe, expect, it } from 'vitest'
import { entityRefToken } from '../../server/services/messages.service'
import { formatDeletionRequestReasonClause } from '../../server/services/workflow-chat.service'

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

  it('builds invoice resent message with entity refs', () => {
    const body = [
      entityRefToken('invoice', '11111111-1111-4111-8111-111111111111', 'INV-000711'),
      'has been resent to',
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
    ].join(' ')

    expect(body).toContain('has been resent to')
  })

  it('builds customer created message with entity refs', () => {
    const body = [
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
      'was created',
    ].join(' ')

    expect(body).toContain('was created')
  })

  it('builds vehicle created message with entity refs', () => {
    const body = [
      entityRefToken('vehicle', '33333333-3333-4333-8333-333333333333', 'Unit 616'),
      'was created for',
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
    ].join(' ')

    expect(body).toContain('was created for')
  })

  it('builds full payment message with entity refs', () => {
    const body = [
      entityRefToken('invoice', '11111111-1111-4111-8111-111111111111', 'INV-000711'),
      'was paid in full for',
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
    ].join(' ')

    expect(body).toContain('was paid in full for')
  })

  it('builds partial payment message with amount', () => {
    const body = [
      'Partial payment of $500.00 received for',
      entityRefToken('invoice', '11111111-1111-4111-8111-111111111111', 'INV-000711'),
      'for',
      entityRefToken('customer', '22222222-2222-4222-8222-222222222222', 'Fleet Co'),
    ].join(' ')

    expect(body).toContain('Partial payment of $500.00 received for')
  })

  it('builds deletion request team message with asset and review links', () => {
    const body = [
      entityRefToken('service_log', '44444444-4444-4444-8444-444444444444', 'Service log SL-1007'),
      'needs to be deleted because',
      formatDeletionRequestReasonClause('Duplicate upload.'),
      'Can an administrator please review the',
      entityRefToken('deletion_request', '55555555-5555-4555-8555-555555555555', 'deletion request'),
      '?',
    ].join(' ')

    expect(body).toContain('Service log SL-1007')
    expect(body).toContain('needs to be deleted because')
    expect(body).toContain('Duplicate upload.')
    expect(body).toContain('[[ref:deletion_request:')
    expect(body).toContain('deletion request')
  })

  it('formats empty deletion reasons for team chat', () => {
    expect(formatDeletionRequestReasonClause('')).toBe('I did not enter a reason.')
    expect(formatDeletionRequestReasonClause('  ')).toBe('I did not enter a reason.')
    expect(formatDeletionRequestReasonClause('Duplicate entry.')).toBe('Duplicate entry.')
  })

  it('builds deletion request message without reason using first-person fallback', () => {
    const body = [
      entityRefToken('service_log', '44444444-4444-4444-8444-444444444444', 'Service log SL-1007'),
      'needs to be deleted.',
      formatDeletionRequestReasonClause(''),
      'Can an administrator please review the',
      entityRefToken('deletion_request', '55555555-5555-4555-8555-555555555555', 'deletion request'),
      '?',
    ].join(' ')

    expect(body).toContain('needs to be deleted.')
    expect(body).toContain('I did not enter a reason.')
    expect(body).not.toContain('needs to be deleted because')
  })
})
