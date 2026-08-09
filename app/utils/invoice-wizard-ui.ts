import {
  buildInvoiceWizardSteps,
  isDraftLineValid,
  previewDraftTotals,
  type DraftLine,
} from './invoice-creator-ui'
import { invoiceDateDisplay, moneyDisplay } from './invoices-ui'
import { vehicleTag, type VehicleDisplay } from './vehicles-ui'

export interface InvoiceWizardStepHintInput {
  step: number
  includeServiceLog?: boolean
  customerName?: string | null
  vehicle?: VehicleDisplay | null
  serviceLogLabel?: string | null
  invoiceDate?: string | null
  lines?: DraftLine[]
  taxExempt?: boolean
  savedTotal?: string | null
  dirty?: boolean
  invoiceId?: string | null
  savedAtLabel?: string | null
}

export function invoiceWizardStepHint(input: InvoiceWizardStepHintInput): string {
  const def = buildInvoiceWizardSteps(input.includeServiceLog ?? false)
    .find(s => s.n === input.step)

  switch (def?.key) {
    case 'customer':
      return input.customerName?.trim() ?? ''
    case 'vehicle':
      return input.vehicle ? vehicleTag(input.vehicle) : ''
    case 'service_log':
      return input.serviceLogLabel?.trim() ?? ''
    case 'dates':
      if (!input.invoiceDate?.trim()) return ''
      return invoiceDateDisplay(input.invoiceDate)
    case 'lines': {
      const hasLines = (input.lines ?? []).some(isDraftLineValid)
      if (!hasLines) return ''
      const total = input.savedTotal
        ?? previewDraftTotals(input.lines ?? [], { taxExempt: input.taxExempt }).total
      return moneyDisplay(total)
    }
    case 'review':
      if (input.dirty || !input.invoiceId) return 'Unsaved'
      return input.savedAtLabel?.trim() || 'Saved'
    default:
      return ''
  }
}

export function invoiceWizardStepHintClass(step: number, input: InvoiceWizardStepHintInput): string {
  const def = buildInvoiceWizardSteps(input.includeServiceLog ?? false)
    .find(s => s.n === step)
  if (def?.key !== 'review') return ''
  if (input.dirty || !input.invoiceId) return 'pending'
  return 'saved'
}

/** When false, invoice wizard skips the service log upload step. */
export function shouldOfferInvoiceWizardServiceLogUpload(flags: {
  aiEnabled?: boolean | null
  serviceLogExtractionEnabled?: boolean | null
} | null | undefined): boolean {
  if (!flags) return false
  return flags.aiEnabled === true && flags.serviceLogExtractionEnabled === true
}
