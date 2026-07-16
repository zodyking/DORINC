import { describe, expect, it, vi } from 'vitest'
import {
  buildOutboundEmailBodies,
  buildReferences,
  buildStaffEmailFooter,
  buildStaffEmailHtmlFooter,
  CUSTOMER_EMAIL_TAGLINE,
  extractEmailAddresses,
  normalizeEmailAddress,
  subjectWithRePrefix,
  toCustomerEmailBrand,
} from '../../server/mail/email-thread'
import {
  messageMatchesCustomerInboxFilter,
  shouldIngestInboundEmail,
} from '../../server/services/email-inbox.service'
import type { EmailBrandContext } from '../../server/services/email-branding.service'

vi.mock('../../server/services/email-branding.service', async () => {
  const actual = await vi.importActual<typeof import('../../server/services/email-branding.service')>(
    '../../server/services/email-branding.service',
  )
  return {
    ...actual,
    resolveEmailBrand: vi.fn(async () => ({
      brandName: 'Devon Onsite Repairs INC',
      brandLegal: 'Devon Onsite Repairs INC',
      brandTagline: 'Accounting workspace',
      logoUrl: 'https://example.com/logo.png',
      logoFileId: null,
      logoInitial: 'D',
      addressLines: ['387 Van Siclen Ave', 'Brooklyn, NY 11207'],
      phone: '(646) 731 7021',
      email: 'accounting@devononsiterepairs.com',
      website: 'https://devononsiterepairs.com/',
      appUrl: 'https://devononsiterepairs.com',
      settingsUrl: 'https://devononsiterepairs.com/admin?tab=notifications',
      helpUrl: 'https://devononsiterepairs.com/help',
      signInUrl: 'https://devononsiterepairs.com/auth/login',
    } satisfies EmailBrandContext)),
  }
})

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

  it('uses a customer-facing brand tagline for outbound mail', () => {
    const brand = toCustomerEmailBrand({
      brandName: 'Devon Onsite Repairs INC',
      brandLegal: 'Devon Onsite Repairs INC',
      brandTagline: 'Accounting workspace',
      logoUrl: null,
      logoInitial: 'D',
      addressLines: [],
      phone: '',
      email: '',
      website: '',
      appUrl: 'https://example.com',
      settingsUrl: 'https://example.com/admin',
      helpUrl: 'https://example.com/help',
      signInUrl: 'https://example.com/login',
    })
    expect(brand.brandTagline).toBe(CUSTOMER_EMAIL_TAGLINE)
    expect(brand.brandTagline).not.toBe('Accounting workspace')
  })

  it('renders a polished staff signature card', () => {
    const html = buildStaffEmailHtmlFooter('Brandon King', {
      brandName: 'Devon Onsite Repairs INC',
      brandLegal: 'Devon Onsite Repairs INC',
      brandTagline: CUSTOMER_EMAIL_TAGLINE,
      logoUrl: null,
      logoInitial: 'D',
      addressLines: ['387 Van Siclen Ave'],
      phone: '(646) 731 7021',
      email: 'accounting@devononsiterepairs.com',
      website: 'https://devononsiterepairs.com/',
      appUrl: 'https://devononsiterepairs.com',
      settingsUrl: 'https://devononsiterepairs.com/admin',
      helpUrl: 'https://devononsiterepairs.com/help',
      signInUrl: 'https://devononsiterepairs.com/auth/login',
    })
    expect(html).toContain('Brandon K.')
    expect(html).toContain('mailto:accounting@devononsiterepairs.com')
    expect(html).toContain('tel:6467317021')
    expect(html).toContain('border-radius:12px')
  })

  it('builds outbound HTML without the internal workspace label', async () => {
    const { html, text, brand } = await buildOutboundEmailBodies(
      {} as never,
      'Brandon King',
      'great\n\nThanks for confirming.',
    )
    expect(brand.brandTagline).toBe(CUSTOMER_EMAIL_TAGLINE)
    expect(html).toContain('Onsite repairs')
    expect(html).not.toContain('Accounting workspace')
    expect(html).not.toContain('>Message<')
    expect(html).toContain('great')
    expect(html).toContain('Thanks for confirming.')
    expect(html).toContain('Brandon K.')
    expect(html).toContain('color:#111827')
    expect(text).toContain('great')
    expect(text).toContain('Brandon K.')
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
