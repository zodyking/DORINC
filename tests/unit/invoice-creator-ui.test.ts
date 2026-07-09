import { describe, expect, it } from 'vitest'
import {
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
    expect(canProceedWizardStep(2, { customerId: 'c1', vehicleId: '', lines: [] })).toBe(false)
    expect(canProceedWizardStep(2, { customerId: 'c1', vehicleId: 'v1', lines: [] })).toBe(true)
    expect(canProceedWizardStep(3, { customerId: 'c1', vehicleId: 'v1', lines: [line] })).toBe(true)
  })
})
