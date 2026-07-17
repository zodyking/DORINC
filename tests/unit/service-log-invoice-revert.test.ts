import { describe, expect, it } from 'vitest'
import { isEditingSessionNoise } from '../../shared/audit-messages'

/** Mirrors batchGetInvoiceRevertStatus invoice-modification detection. */
function invoiceWasModifiedAfterCreate(actions: string[]): boolean {
  return actions
    .filter(action => action !== 'invoices.create')
    .some(action => !isEditingSessionNoise(action))
}

describe('service log invoice revert contract', () => {
  it('allows revert for pristine service-log invoices even with copied line items', () => {
    expect(invoiceWasModifiedAfterCreate(['invoices.create'])).toBe(false)
  })

  it('blocks revert when an accountant adds line items after conversion', () => {
    expect(invoiceWasModifiedAfterCreate([
      'invoices.create',
      'invoices.line_items.create',
    ])).toBe(true)
  })
})
