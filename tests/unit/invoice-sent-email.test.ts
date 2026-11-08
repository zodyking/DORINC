import { describe, expect, it } from 'vitest'
import {
  buildInvoiceSentEmail,
  invoiceSendEditableDefaults,
} from '../../server/mail/customer-email-templates'
import { buildInvoiceAttachedEmail } from '../../server/mail/templates/system.mjs'

const appUrl = 'https://devononsiterepairs.com'
const publicUrl = 'https://devononsiterepairs.com/i/tomer-dvora/abcXYZ-_token/INV-000768'

describe('invoice sent email', () => {
  it('keeps portal copy and CTA when the customer portal is on', () => {
    const mail = buildInvoiceSentEmail({
      recipientName: 'Tomer Dvora',
      invoiceNumber: 'INV-000768',
      invoiceId: 'inv-1',
      dueDate: '2026-08-30',
      total: '935.00',
      appUrl,
      customerPortalEnabled: true,
    })

    expect(mail.subject).toBe('Invoice INV-000768 Is Ready')
    expect(mail.text).toContain('available in your customer portal')
    expect(mail.text).toContain('submit a request through the portal')
    expect(mail.text).toContain(`${appUrl}/portal/invoices/inv-1`)
    expect(mail.html).toContain('View invoice in the portal')
    expect(mail.html).toContain(`${appUrl}/portal/invoices/inv-1`)
    expect(mail.html).toMatch(/Portal/)
    expect(mail.html).not.toContain('View invoice online')
  })

  it('uses the public invoice page and omits portal copy when the portal is off', () => {
    const mail = buildInvoiceSentEmail({
      recipientName: 'Tomer Dvora',
      invoiceNumber: 'INV-000768',
      invoiceId: 'inv-1',
      dueDate: '2026-08-30',
      total: '935.00',
      appUrl,
      customerPortalEnabled: false,
      viewUrl: publicUrl,
      templateOverride: {
        lead: 'Invoice {{invoiceNumber}} has been sent and is available in your customer portal.',
        noteBody: 'Submit a request through the portal.',
        primaryActionLabel: 'View invoice in the portal',
      },
    })

    expect(invoiceSendEditableDefaults('INV-000768', 'online').message).toContain('available online')
    expect(mail.text).toContain('available online')
    expect(mail.text).toContain(publicUrl)
    expect(mail.text).not.toMatch(/portal/i)
    expect(mail.html).toContain('View invoice online')
    expect(mail.html).toContain(publicUrl)
    expect(mail.html).not.toMatch(/portal/i)
    expect(mail.html).toMatch(/Online/)
  })

  it('does not mention the portal in attached-email fallback when portal is off', () => {
    const mail = buildInvoiceAttachedEmail({
      recipientName: 'Tomer Dvora',
      invoiceNumber: 'INV-000768',
      dueDate: '2026-08-30',
      total: '935.00',
      appUrl,
      customerPortalEnabled: false,
      viewUrl: publicUrl,
      templateOverride: {
        noteBody: 'Submit a request through your customer portal.',
      },
    })

    expect(mail.text).toContain(publicUrl)
    expect(mail.text).not.toMatch(/portal/i)
    expect(mail.html).toContain('View invoice online')
    expect(mail.html).toContain(publicUrl)
    expect(mail.html).not.toMatch(/portal/i)
  })
})
