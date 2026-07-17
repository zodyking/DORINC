import { describe, expect, it, vi } from 'vitest'
import {
  buildOutboundEmailBodies,
  buildReferences,
  buildReplyThreadHeaders,
  buildStaffEmailFooter,
  buildStaffEmailSignature,
  CUSTOMER_EMAIL_TAGLINE,
  extractEmailAddresses,
  normalizeEmailAddress,
  subjectWithRePrefix,
  toCustomerEmailBrand,
} from '../../server/mail/email-thread'
import {
  messageMatchesCustomerInboxFilter,
  shouldIncludeEmailThreadInDefaultScope,
  shouldIngestCompanyOutboundEmail,
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

  it('builds reply headers from the inbound subject and complete reference chain', () => {
    expect(buildReplyThreadHeaders({
      subject: 'Invoice question',
      fallbackSubject: 'We received your message',
      parentMessageId: '<latest@customer.test>',
      existingReferences: '<root@customer.test> <previous@customer.test>',
    })).toEqual({
      subject: 'Re: Invoice question',
      inReplyTo: '<latest@customer.test>',
      references: '<root@customer.test> <previous@customer.test> <latest@customer.test>',
    })
  })

  it('formats staff footer with first name, last initial and role', () => {
    const footer = buildStaffEmailFooter('Jane Doe', 'Administrator')
    expect(footer).toContain('— Jane D.')
    expect(footer).toContain('Administrator')
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

  it('renders a simple staff signature with name and role', () => {
    const html = buildStaffEmailSignature('Brandon King', 'Administrator')
    expect(html).toContain('— Brandon K.')
    expect(html).toContain('Administrator')
    expect(html).toContain('font-weight:700')
    // Contact details live in the shared footer, not the signature.
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('border-radius:12px')
  })

  it('builds outbound HTML with the subject as the header subheading', async () => {
    const { html, text, brand } = await buildOutboundEmailBodies(
      {} as never,
      {
        staffName: 'Brandon King',
        accountTypeKey: 'admin',
        bodyText: 'great\n\nThanks for confirming.',
        subject: 'Invoice question',
      },
    )
    expect(brand.brandTagline).toBe('Invoice question')
    expect(html).toContain('Invoice question')
    expect(html).not.toContain('Accounting workspace')
    expect(html).not.toContain('>Message<')
    expect(html).not.toContain('<h1')
    expect(html).toContain('great')
    expect(html).toContain('Thanks for confirming.')
    expect(html).toContain('— Brandon K.')
    expect(html).toContain('Administrator')
    expect(text).toContain('great')
    expect(text).toContain('— Brandon K.')
    expect(text).toContain('Administrator')
  })

  it('falls back to a customer-facing tagline when no subject is given', async () => {
    const { brand } = await buildOutboundEmailBodies(
      {} as never,
      { staffName: 'Brandon King', accountTypeKey: 'manager', bodyText: 'hello' },
    )
    expect(brand.brandTagline).toBe(CUSTOMER_EMAIL_TAGLINE)
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

describe('shouldIncludeEmailThreadInDefaultScope', () => {
  const customerEmails = new Set(['customer@client.com'])

  it('includes customer-linked threads in the default scope', () => {
    expect(shouldIncludeEmailThreadInDefaultScope(
      { customerId: 'cust-1', staffInitiated: false, counterpartEmail: 'customer@client.com' },
      customerEmails,
    )).toBe(true)
  })

  it('includes staff-initiated non-customer threads without Show all', () => {
    expect(shouldIncludeEmailThreadInDefaultScope(
      { customerId: null, staffInitiated: true, counterpartEmail: 'vendor@example.com' },
      customerEmails,
    )).toBe(true)
  })

  it('excludes unrelated inbound threads unless Show all is enabled', () => {
    expect(shouldIncludeEmailThreadInDefaultScope(
      { customerId: null, staffInitiated: false, counterpartEmail: 'newsletter@example.com' },
      customerEmails,
    )).toBe(false)
    expect(shouldIncludeEmailThreadInDefaultScope(
      { customerId: null, staffInitiated: false, counterpartEmail: 'newsletter@example.com' },
      customerEmails,
      'all',
    )).toBe(true)
  })
})

describe('shouldIngestCompanyOutboundEmail', () => {
  const companyInboxes = new Set(['accounting@company.com'])

  it('accepts company replies to customers in existing threads', () => {
    expect(shouldIngestCompanyOutboundEmail(
      companyInboxes,
      'accounting@company.com',
      ['customer@client.com'],
    )).toBe(true)
  })

  it('rejects company mail without recipients or from unknown inboxes', () => {
    expect(shouldIngestCompanyOutboundEmail(
      companyInboxes,
      'accounting@company.com',
      [],
    )).toBe(false)
    expect(shouldIngestCompanyOutboundEmail(
      companyInboxes,
      'customer@client.com',
      ['accounting@company.com'],
    )).toBe(false)
  })
})
