import type { InvoiceLineType } from './invoices-ui'
import { lineTypeLabel } from './invoices-ui'
import { moneyDisplay } from './invoices-ui'

export type DigitalLineType = InvoiceLineType

export interface DigitalLineDraft {
  lineType: DigitalLineType
  description: string
  qty: string
  rate: string
  amount: string
}

export const DIGITAL_LINE_TYPES: DigitalLineType[] = ['labor', 'part', 'service', 'fee']

export function qtyLabelForLineType(type: DigitalLineType): string {
  return type === 'labor' ? 'Hours' : 'Quantity'
}

export function rateLabelForLineType(type: DigitalLineType): string {
  switch (type) {
    case 'labor': return 'Rate per hour'
    case 'part': return 'Unit price'
    case 'service': return 'Service price'
    case 'fee': return 'Fee amount'
  }
}

export function qtyPlaceholderForLineType(type: DigitalLineType): string {
  return type === 'labor' ? 'e.g. 2.5' : 'e.g. 1'
}

export function ratePlaceholderForLineType(type: DigitalLineType): string {
  return type === 'labor' ? 'e.g. 125.00' : 'e.g. 48.20'
}

export function calcLineAmount(qty: string, rate: string): string {
  const q = Number.parseFloat(qty.replace(/,/g, ''))
  const r = Number.parseFloat(rate.replace(/,/g, '').replace(/^\$/, ''))
  if (!Number.isFinite(q) || !Number.isFinite(r)) return ''
  return (q * r).toFixed(2)
}

export function emptyDigitalLine(): Omit<DigitalLineDraft, 'lineType'> & { lineType: DigitalLineType | '' } {
  return { lineType: '', description: '', qty: '', rate: '', amount: '' }
}

export function toApiDraftLine(line: DigitalLineDraft) {
  return {
    lineType: line.lineType,
    description: line.description.trim(),
    qty: line.qty.trim() || null,
    rate: line.rate.trim() || null,
    amount: line.amount.trim() || calcLineAmount(line.qty, line.rate) || null,
  }
}

export function digitalLinesSummary(lines: DigitalLineDraft[]): string {
  if (!lines.length) return 'Digital log · no lines yet'
  return `Digital log · ${lines.length} line item${lines.length === 1 ? '' : 's'}`
}

export function digitalLinesToNotes(lines: DigitalLineDraft[]): string {
  return lines.map((line) => {
    const amt = line.amount || calcLineAmount(line.qty, line.rate)
    const qtyPart = line.qty ? `${line.qty} ${qtyLabelForLineType(line.lineType).toLowerCase()}` : ''
    const ratePart = line.rate ? `@ ${line.rate}` : ''
    const amountPart = amt ? ` = ${moneyDisplay(amt)}` : ''
    return `${lineTypeLabel(line.lineType)}: ${line.description}${qtyPart ? ` · ${qtyPart}` : ''}${ratePart ? ` ${ratePart}` : ''}${amountPart}`
  }).join('\n')
}
