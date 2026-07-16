import { describe, expect, it } from 'vitest'
import {
  buildReferences,
  buildStaffEmailFooter,
  extractEmailAddresses,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../../server/mail/email-thread'
import { messageMatchesFilter } from '../../server/services/email-inbox.service'

describe('email-thread helpers', () => {
  it('normalizes display-name wrapped addresses', () => {
    expect(normalizeEmailAddress('Shop <billing@example.com>')).toBe('billing@example.com')
    expect(normalizeEmailAddress('billing@example.com')).toBe('billing@example.com')
  })

  it('extracts multiple comma-separated addresses', () => {
    expect(extractEmailAddresses('A <a@x.com>, b@y.com')).toEqual(['a@x.com', 'b@y.com'])
  })

  it('adds Re prefix once', () => {
    expect(subjectWithRePrefix('Hello')).toBe('Re: Hello')
    expect(subjectWithRePrefix('Re: Hello')).toBe('Re: Hello')
  })

  it('builds references chain', () => {
    expect(buildReferences('<a@x.com>', '<b@y.com>')).toBe('<a@x.com> <b@y.com>')
    expect(buildReferences(null, '<b@y.com>')).toBe('<b@y.com>')
  })

  it('formats staff footer with first name and last initial', () => {
    expect(buildStaffEmailFooter('Jane Doe', 'Devon Onsite Repairs Inc')).toContain('Jane D.')
    expect(buildStaffEmailFooter('Jane Doe', 'Devon Onsite Repairs Inc')).toContain('Devon Onsite Repairs Inc')
  })
})

describe('messageMatchesFilter', () => {
  const allowed = new Set(['shop@company.com', 'customer@client.com'])

  it('matches when company address is in To', () => {
    expect(messageMatchesFilter(allowed, 'someone@else.com', ['shop@company.com'], [])).toBe(true)
  })

  it('matches when customer address is in From', () => {
    expect(messageMatchesFilter(allowed, 'customer@client.com', ['shop@company.com'], [])).toBe(true)
  })

  it('rejects unrelated participants', () => {
    expect(messageMatchesFilter(allowed, 'spam@junk.com', ['other@junk.com'], [])).toBe(false)
  })

  it('matches Cc participants', () => {
    expect(messageMatchesFilter(allowed, 'x@y.com', ['a@b.com'], ['customer@client.com'])).toBe(true)
  })
})
