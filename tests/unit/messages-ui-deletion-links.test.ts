import { describe, expect, it } from 'vitest'
import { entityPathForMessageLink } from '../../app/utils/messages-ui'

describe('messages-ui deletion request links', () => {
  it('routes deletion request refs to the review queue with request id', () => {
    const path = entityPathForMessageLink(
      'deletion_request',
      '55555555-5555-4555-8555-555555555555',
      { can: () => true },
    )
    expect(path).toBe('/deletion-requests?request=55555555-5555-4555-8555-555555555555&ref=message')
  })
})
