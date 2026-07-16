import { describe, expect, it } from 'vitest'
import {
  buildReferences,
  buildStaffEmailFooter,
  extractEmailAddresses,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../../server/mail/email-thread'
import { messageMatchesCustomerInboxFilter } from '../../server/services/email-inbox.service'

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

describe('messageMatchesCustomerInboxFilter', () => {
  const companyInboxes = new Set(['accounting@company.com'])
  const customerEmails = new Set(['customer@client.com', 'devononsiterepairsinc@gmail.com'])

  it('matches customer email sent to company inbox', () => {
    expect(messageMatchesCustomerInboxFilter(
      companyInboxes,
      customerEmails,
      'customer@client.com',
      ['accounting@company.com'],
      [],
    )).toBe(true)
  })

  it('matches when company inbox is in Cc', () => {
    expect(messageMatchesCustomerInboxFilter(
      companyInboxes,
      customerEmails,
      'devononsiterepairsinc@gmail.com',
      ['other@staff.com'],
      ['accounting@company.com'],
    )).toBe(true)
  })

  it('rejects Google alerts not from a customer', () => {
    expect(messageMatchesCustomerInboxFilter(
      companyInboxes,
      customerEmails,
      'no-reply@accounts.google.com',
      ['accounting@company.com'],
      [],
    )).toBe(false)
  })

  it('rejects customer mail not sent to company inbox', () => {
    expect(messageMatchesCustomerInboxFilter(
      companyInboxes,
      customerEmails,
      'customer@client.com',
      ['other@junk.com'],
      [],
    )).toBe(false)
  })

  it('rejects when customer or company sets are empty', () => {
    expect(messageMatchesCustomerInboxFilter(
      new Set(),
      customerEmails,
      'customer@client.com',
      ['accounting@company.com'],
      [],
    )).toBe(false)
  })
})
