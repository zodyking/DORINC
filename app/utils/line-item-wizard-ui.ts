import type { DraftLine } from './invoice-creator-ui'
import { previewLineAmount } from './invoice-creator-ui'
import { LINE_ITEM_TYPES, type LineItemType } from '#shared/line-item-types'
import { lineTypeLabel, moneyDisplay } from './invoices-ui'

export type WizardLineType = LineItemType

export interface WizardLineDraft {
  lineType: WizardLineType
  description: string
  qty: string
  rate: string
  amount: string
}

export const WIZARD_LINE_TYPES: WizardLineType[] = [...LINE_ITEM_TYPES]

export function qtyLabelForLineType(type: WizardLineType): string {
  return type === 'labor' ? 'Hours' : 'Quantity'
}

export function rateLabelForLineType(type: WizardLineType): string {
  switch (type) {
    case 'labor': return 'Rate per hour'
    case 'part': return 'Unit price'
    case 'fee': return 'Fee amount'
  }
}

export function qtyPlaceholderForLineType(type: WizardLineType): string {
  return type === 'labor' ? 'e.g. 2.5' : 'e.g. 1'
}

export function ratePlaceholderForLineType(type: WizardLineType): string {
  return type === 'labor' ? 'e.g. 125.00' : 'e.g. 48.20'
}

export function calcLineAmount(qty: string, rate: string): string {
  const q = Number.parseFloat(qty.replace(/,/g, ''))
  const r = Number.parseFloat(rate.replace(/,/g, '').replace(/^\$/, ''))
  if (!Number.isFinite(q) || !Number.isFinite(r)) return ''
  return (q * r).toFixed(2)
}

export function emptyWizardLine(): Omit<WizardLineDraft, 'lineType'> & { lineType: WizardLineType | '' } {
  return { lineType: '', description: '', qty: '', rate: '', amount: '' }
}

export function toApiDraftLine(line: WizardLineDraft) {
  return {
    lineType: line.lineType,
    description: line.description.trim(),
    qty: line.qty.trim() || null,
    rate: line.rate.trim() || null,
    amount: line.amount.trim() || calcLineAmount(line.qty, line.rate) || null,
  }
}

export function wizardLinesSummary(lines: WizardLineDraft[], label = 'Line items'): string {
  if (!lines.length) return `${label} · none yet`
  return `${label} · ${lines.length} line item${lines.length === 1 ? '' : 's'}`
}

export function wizardLinesToNotes(lines: WizardLineDraft[]): string {
  return lines.map((line) => {
    const amt = line.amount || calcLineAmount(line.qty, line.rate)
    const qtyPart = line.qty ? `${line.qty} ${qtyLabelForLineType(line.lineType).toLowerCase()}` : ''
    const ratePart = line.rate ? `@ ${line.rate}` : ''
    const amountPart = amt ? ` = ${moneyDisplay(amt)}` : ''
    return `${lineTypeLabel(line.lineType)}: ${line.description}${qtyPart ? ` · ${qtyPart}` : ''}${ratePart ? ` ${ratePart}` : ''}${amountPart}`
  }).join('\n')
}

export function draftLineToWizard(line: DraftLine): WizardLineDraft {
  return {
    lineType: line.lineType,
    description: line.description,
    qty: line.quantity,
    rate: line.unitPrice,
    amount: line.lineAmount || previewLineAmount(line.quantity, line.unitPrice) || '',
  }
}

export function wizardLineToDraft(line: WizardLineDraft): DraftLine {
  return {
    localId: crypto.randomUUID(),
    lineType: line.lineType,
    description: line.description.trim(),
    quantity: line.qty.trim(),
    unitPrice: line.rate.trim(),
    catalogItemId: null,
    lineAmount: line.amount || previewLineAmount(line.qty, line.rate) || undefined,
  }
}

export function wizardLinesToDraftLines(lines: WizardLineDraft[]): DraftLine[] {
  return lines.map(wizardLineToDraft)
}
