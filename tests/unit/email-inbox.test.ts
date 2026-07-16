import { describe, expect, it, vi } from 'vitest'
import {
  buildReferences,
  buildStaffEmailFooter,
  extractEmailAddresses,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../../server/mail/email-thread'
import {
  messageMatchesCustomerInboxFilter,
  shouldIngestInboundEmail,
} from '../../server/services/email-inbox.service'

vi.mock('../../server/services/imap-config.service', () => ({
  getImapFilters: vi.fn(() => ({
    companyEmail: 'accounting@company.com',
    additionalEmails: [],
    includeCustomerEmails: true,
    autoResponder: {
      enabled: true,
      scope: 'all',
      subject: 'We received your message',
      message: 'Thanks for contacting us.',
    },
  })),
}))

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

describe('shouldIngestInboundEmail', () => {
  const companyInboxes = new Set(['accounting@company.com'])
  const customerEmails = new Set(['customer@client.com'])

  it('ingests unknown senders when auto-responder scope is all', () => {
    expect(shouldIngestInboundEmail(
      companyInboxes,
      customerEmails,
      'stranger@example.com',
      ['accounting@company.com'],
      [],
    )).toBe(true)
  })

  it('rejects unknown senders when auto-responder scope is customers only', async () => {
    const { getImapFilters } = await import('../../server/services/imap-config.service')
    vi.mocked(getImapFilters).mockReturnValueOnce({
      companyEmail: 'accounting@company.com',
      additionalEmails: [],
      includeCustomerEmails: true,
      autoResponder: {
        enabled: true,
        scope: 'customers',
        subject: 'We received your message',
        message: 'Thanks for contacting us.',
      },
    })
    expect(shouldIngestInboundEmail(
      companyInboxes,
      customerEmails,
      'stranger@example.com',
      ['accounting@company.com'],
      [],
    )).toBe(false)
  })
})
