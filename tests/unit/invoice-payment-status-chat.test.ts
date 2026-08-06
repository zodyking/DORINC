import { describe, expect, it } from 'vitest'
import {
  buildBulkInvoicePaymentStatusTeamMessageBody,
  buildInvoicePaymentStatusTeamMessageBody,
} from '../../server/services/workflow-chat.service'

describe('invoice payment status team chat copy', () => {
  it('builds single-invoice paid/unpaid status messages', () => {
    const paid = buildInvoicePaymentStatusTeamMessageBody({
      invoiceId: 'inv-1',
      invoiceNumber: 42,
      customerId: 'cust-1',
      customerName: 'John Doe',
      status: 'paid',
    })
    expect(paid.body).toContain('payment status has been set to paid')
    expect(paid.body).toContain('John Doe')
    expect(paid.refs).toHaveLength(2)

    const unpaid = buildInvoicePaymentStatusTeamMessageBody({
      invoiceId: 'inv-1',
      invoiceNumber: 42,
      customerId: null,
      customerName: 'John Doe',
      status: 'unpaid',
    })
    expect(unpaid.body).toContain('payment status has been set to unpaid')
    expect(unpaid.refs).toHaveLength(1)
  })

  it('builds bulk messages with one line per customer', () => {
    const { body, refs } = buildBulkInvoicePaymentStatusTeamMessageBody({
      status: 'paid',
      groups: [
        {
          customerId: 'c1',
          customerName: 'John Doe',
          count: 43,
          invoices: [
            { invoiceId: 'i1', invoiceNumber: 1 },
            { invoiceId: 'i2', invoiceNumber: 2 },
          ],
        },
        {
          customerId: 'c2',
          customerName: 'Jane Smith',
          count: 1,
          invoices: [{ invoiceId: 'i3', invoiceNumber: 3 }],
        },
      ],
    })

    expect(body).toContain('For ')
    expect(body).toContain('43 invoices have been set to paid')
    expect(body).toContain('1 invoice has been set to paid')
    expect(body.split('\n')).toHaveLength(2)
    expect(refs.length).toBeGreaterThan(2)
  })
})
