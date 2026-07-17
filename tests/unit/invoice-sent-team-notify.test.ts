import { describe, expect, it } from 'vitest'
import {
  buildBulkInvoiceSentTeamMessageBody,
  buildInvoiceSentTeamMessageBody,
} from '../../server/lib/invoice-sent-team-notify.mjs'

const customer = {
  customerId: '22222222-2222-4222-8222-222222222222',
  customerName: 'Fleet Co',
}

describe('invoice sent team notify message bodies', () => {
  it('builds first-send message with entity refs', () => {
    const { body } = buildInvoiceSentTeamMessageBody({
      invoiceId: '11111111-1111-4111-8111-111111111111',
      invoiceNumber: 711,
      ...customer,
      isResend: false,
    })

    expect(body).toContain('has been sent to')
    expect(body).not.toContain('has been resent to')
    expect(body).toContain('[[ref:invoice:')
    expect(body).toContain('INV-000711')
  })

  it('builds resend message with entity refs', () => {
    const { body } = buildInvoiceSentTeamMessageBody({
      invoiceId: '11111111-1111-4111-8111-111111111111',
      invoiceNumber: 711,
      ...customer,
      isResend: true,
    })

    expect(body).toContain('has been resent to')
    expect(body).not.toContain('has been sent to')
  })

  it('builds bulk sent message listing invoices neatly', () => {
    const { body } = buildBulkInvoiceSentTeamMessageBody({
      ...customer,
      invoices: [
        { invoiceId: '11111111-1111-4111-8111-111111111111', invoiceNumber: 711, isResend: false },
        { invoiceId: '33333333-3333-4333-8333-333333333333', invoiceNumber: 712, isResend: false },
      ],
    })

    expect(body).toContain('have been sent to')
    expect(body).toContain('INV-000711')
    expect(body).toContain('INV-000712')
    expect(body).toContain('and')
  })

  it('builds bulk resent message listing invoices neatly', () => {
    const { body } = buildBulkInvoiceSentTeamMessageBody({
      ...customer,
      invoices: [
        { invoiceId: '11111111-1111-4111-8111-111111111111', invoiceNumber: 711, isResend: true },
        { invoiceId: '33333333-3333-4333-8333-333333333333', invoiceNumber: 712, isResend: true },
      ],
    })

    expect(body).toContain('have been resent to')
    expect(body).not.toContain('have been sent to')
  })

  it('splits mixed bulk send into sent and resent sections', () => {
    const { body } = buildBulkInvoiceSentTeamMessageBody({
      ...customer,
      invoices: [
        { invoiceId: '11111111-1111-4111-8111-111111111111', invoiceNumber: 711, isResend: false },
        { invoiceId: '33333333-3333-4333-8333-333333333333', invoiceNumber: 712, isResend: true },
      ],
    })

    expect(body).toContain('has been sent to')
    expect(body).toContain('has been resent to')
    expect(body).toContain('. ')
  })
})
