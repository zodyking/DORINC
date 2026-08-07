import { describe, expect, it } from 'vitest'
import { createEmptyLine, type DraftLine } from '../../app/utils/invoice-creator-ui'
import { invoiceWizardStepHint, invoiceWizardStepHintClass } from '../../app/utils/invoice-wizard-ui'

describe('invoice-wizard-ui', () => {
  const vehicle = {
    unitType: 'bus',
    busNumber: '42',
    unitTag: null,
    year: 2019,
    make: 'Blue Bird',
    model: 'Vision',
    trim: null,
  }

  it('shows step hints from wizard data', () => {
    const line = createEmptyLine()
    line.description = 'Labor'
    const lines: DraftLine[] = [line]

    expect(invoiceWizardStepHint({
      step: 1,
      customerName: 'Acme Fleet',
    })).toBe('Acme Fleet')

    expect(invoiceWizardStepHint({
      step: 2,
      vehicle,
    })).toBe('Bus #42')

    expect(invoiceWizardStepHint({
      step: 2,
      vehicle: {
        ...vehicle,
        busNumber: null,
        unitTag: null,
      },
    })).toBe('2019 Blue Bird Vision')

    expect(invoiceWizardStepHint({
      step: 3,
      invoiceDate: '2026-07-15',
    })).toMatch(/Jul 15, 2026/)

    expect(invoiceWizardStepHint({
      step: 4,
      lines,
    })).toBe('$145.00')

    expect(invoiceWizardStepHint({
      step: 5,
      dirty: true,
      invoiceId: 'inv-1',
    })).toBe('Unsaved')

    expect(invoiceWizardStepHint({
      step: 5,
      dirty: false,
      invoiceId: 'inv-1',
      savedAtLabel: 'Saved Jul 15, 09:45 PM',
    })).toBe('Saved Jul 15, 09:45 PM')
  })

  it('marks review hint pending when unsaved', () => {
    expect(invoiceWizardStepHintClass(5, { step: 5, dirty: true, invoiceId: 'inv-1' })).toBe('pending')
    expect(invoiceWizardStepHintClass(5, { step: 5, dirty: false, invoiceId: 'inv-1' })).toBe('saved')
    expect(invoiceWizardStepHintClass(1, { step: 1 })).toBe('')
  })
})
