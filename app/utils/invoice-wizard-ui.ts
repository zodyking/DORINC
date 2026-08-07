import {
  isDraftLineValid,
  previewDraftTotals,
  type DraftLine,
} from './invoice-creator-ui'
import { invoiceDateDisplay, moneyDisplay } from './invoices-ui'
import { vehicleTag, type VehicleDisplay } from './vehicles-ui'

export interface InvoiceWizardStepHintInput {
  step: number
  customerName?: string | null
  vehicle?: VehicleDisplay | null
  invoiceDate?: string | null
  lines?: DraftLine[]
  taxExempt?: boolean
  savedTotal?: string | null
  dirty?: boolean
  invoiceId?: string | null
  savedAtLabel?: string | null
}

export function invoiceWizardStepHint(input: InvoiceWizardStepHintInput): string {
  switch (input.step) {
    case 1:
      return input.customerName?.trim() ?? ''
    case 2:
      return input.vehicle ? vehicleTag(input.vehicle) : ''
    case 3:
      if (!input.invoiceDate?.trim()) return ''
      return invoiceDateDisplay(input.invoiceDate)
    case 4: {
      const hasLines = (input.lines ?? []).some(isDraftLineValid)
      if (!hasLines) return ''
      const total = input.savedTotal
        ?? previewDraftTotals(input.lines ?? [], { taxExempt: input.taxExempt }).total
      return moneyDisplay(total)
    }
    case 5:
      if (input.dirty || !input.invoiceId) return 'Unsaved'
      return input.savedAtLabel?.trim() || 'Saved'
    default:
      return ''
  }
}

export function invoiceWizardStepHintClass(step: number, input: InvoiceWizardStepHintInput): string {
  if (step !== 5) return ''
  if (input.dirty || !input.invoiceId) return 'pending'
  return 'saved'
}
