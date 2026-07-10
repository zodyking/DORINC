import { describe, expect, it } from 'vitest'
import {
  previewLineAmount,
  previewLinesSubtotal,
  previewLineTypeBreakdown,
  canProceedWizardStep,
  createEmptyLine,
  dueDateFromTerms,
  formatInvoiceNumberDisplay,
  isDraftLineValid,
  wizardStateLabel,
} from '../../app/utils/invoice-creator-ui'

describe('invoice-creator-ui helpers (P1-23)', () => {
  it('computes due dates from payment terms', () => {
    expect(dueDateFromTerms('2026-07-07', 'net_30')).toBe('2026-08-06')
    expect(dueDateFromTerms('2026-07-07', 'due_on_receipt')).toBe('2026-07-07')
    expect(dueDateFromTerms('2026-07-07', 'net_15')).toBe('2026-07-22')
  })

  it('labels wizard steps', () => {
    expect(wizardStateLabel(1)).toBe('Step 1 of 4 — Customer')
    expect(wizardStateLabel(4)).toBe('Step 4 of 4 — Review')
  })

  it('formats invoice numbers like the mockup', () => {
    expect(formatInvoiceNumberDisplay(95)).toBe('INV-000095')
  })

  it('validates draft lines and step progression', () => {
    const line = createEmptyLine()
    expect(isDraftLineValid(line)).toBe(false)
    line.description = 'Diagnostic labor'
    expect(isDraftLineValid(line)).toBe(true)
    expect(canProceedWizardStep(1, { customerId: '', vehicleId: '', lines: [] })).toBe(false)
    expect(canProceedWizardStep(2, { customerId: 'c1', vehicleId: '', lines: [] })).toBe(true)
    expect(canProceedWizardStep(3, { customerId: 'c1', vehicleId: 'v1', lines: [line] })).toBe(true)
  })

  it('previews line amounts and subtotals while typing', () => {
    const line = createEmptyLine()
    line.description = 'Brake labor'
    line.quantity = '2'
    line.unitPrice = '145.00'
    expect(previewLineAmount('2', '145.00')).toBe('290.00')
    expect(previewLinesSubtotal([line])).toBe('290.00')
  })

  it('breaks subtotals down by parts, labor, and fees', () => {
    const labor = createEmptyLine()
    labor.description = 'Diagnostic labor'
    labor.lineType = 'labor'
    labor.quantity = '1'
    labor.unitPrice = '145.00'

    const part = createEmptyLine()
    part.description = 'Oil filter'
    part.lineType = 'part'
    part.quantity = '2'
    part.unitPrice = '18.40'

    const fee = createEmptyLine()
    fee.description = 'Shop supplies'
    fee.lineType = 'fee'
    fee.quantity = '1'
    fee.unitPrice = '12.00'

    expect(previewLineTypeBreakdown([labor, part, fee])).toEqual({
      parts: '36.80',
      labor: '145.00',
      fees: '12.00',
    })
  })
})
