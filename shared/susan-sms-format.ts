/**
 * Plain-text SMS layout for Susan action-menu replies.
 * No UUIDs, camelCase, or packed one-line dumps.
 */

import type { SusanSmsPickOption } from './susan-sms-actions'

export const SUSAN_SMS_MENU_HINT = 'Text Menu anytime.'
export const SUSAN_SMS_BACK_HINT = 'Text Back to go back.'
export const SUSAN_SMS_PICK_FOOTER = 'Reply with a number or name.\nText Back to go back.'
export const SUSAN_SMS_MORE_HINT = 'Text Menu for more.'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_manager_approval: 'Pending approval',
  sent: 'Sent',
  paid: 'Paid',
  void: 'Void',
  uploaded: 'Uploaded',
  ready_for_review: 'Ready for review',
  in_review: 'In review',
  needs_info: 'Needs info',
  converted_to_invoice: 'Converted',
  rejected: 'Rejected',
  approved: 'Approved',
  converted: 'Converted',
  expired: 'Expired',
}

const TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
}

export function formatSmsMoney(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatSmsDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return ''
  const raw = typeof value === 'string' ? value : value.toISOString()
  const day = raw.slice(0, 10)
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return raw
  const month = Number(match[2])
  const date = Number(match[3])
  return `${month}/${date}/${match[1]}`
}

export function formatSmsStatus(raw: string | null | undefined): string {
  const key = String(raw || '').trim()
  if (!key) return ''
  return STATUS_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function formatSmsPaymentTerms(raw: string | null | undefined): string {
  const key = String(raw || '').trim()
  if (!key) return ''
  return TERMS_LABELS[key] || key.replace(/_/g, ' ')
}

export function formatSmsAccountKind(raw: string | null | undefined): string {
  const key = String(raw || '').trim().toLowerCase()
  if (key === 'fleet') return 'Fleet'
  if (key === 'individual') return 'Individual'
  return key ? key.replace(/_/g, ' ') : ''
}

/** Rank a haystack against a short query. Higher is closer. */
export function rankSmsNameMatch(query: string, haystack: string): number {
  const q = String(query || '').trim().toLowerCase()
  const n = String(haystack || '').trim().toLowerCase()
  if (!q || !n) return 0
  if (n === q) return 100
  if (n.startsWith(q)) return 85
  const words = n.split(/\s+/).filter(Boolean)
  if (words.some(w => w === q)) return 80
  if (words.some(w => w.startsWith(q))) return 70
  if (n.includes(q)) return 50
  return 0
}

export function matchSusanSmsPickOption(
  options: SusanSmsPickOption[] | undefined,
  text: string,
): SusanSmsPickOption | 'ambiguous' | null {
  if (!options?.length) return null
  const raw = String(text || '').trim()
  if (!raw) return null
  if (/^([1-9]|10)[.)]?$/.test(raw)) {
    const n = Number(raw.replace(/[.)]/g, ''))
    return options.find(o => o.n === n) ?? null
  }

  const scored = options
    .map(option => ({
      option,
      score: Math.max(
        rankSmsNameMatch(raw, option.label),
        rankSmsNameMatch(raw, option.extra?.name || ''),
      ),
    }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return null
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return 'ambiguous'
  return scored[0]!.option
}

export function formatSusanSmsChoiceList(
  title: string,
  options: SusanSmsPickOption[],
  footer = SUSAN_SMS_PICK_FOOTER,
): string {
  const blocks = options.map((option) => {
    const lines = option.label.split('\n').map(l => l.trim()).filter(Boolean)
    const head = lines[0] || option.label
    const rest = lines.slice(1)
    return rest.length ? `${option.n}) ${head}\n${rest.join('\n')}` : `${option.n}) ${head}`
  })
  return [title.trim(), '', blocks.join('\n\n'), '', footer].filter((line, i, arr) => {
    if (line !== '') return true
    return i > 0 && i < arr.length - 1 && arr[i - 1] !== ''
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function formatSusanSmsInvoiceCard(inv: {
  invoiceNumberFormatted: string
  status: string
  customerName: string
  invoiceDate?: string | Date | null
  dueDate?: string | Date | null
  total?: string | number | null
  amountPaid?: string | number | null
  balanceDue?: string | number | null
  poNumber?: string | null
  vehicle?: { busNumber?: string | null, unitTag?: string | null, year?: number | string | null, make?: string | null, model?: string | null } | null
  vehicleSnapshot?: { busNumber?: string | null, unitTag?: string | null, year?: number | string | null, make?: string | null, model?: string | null } | null
  lineItems?: Array<{ description?: string | null, lineAmount?: string | number | null }>
}): string {
  const vehicle = smsVehicleLabel(inv.vehicle ?? inv.vehicleSnapshot)
  const lines = (inv.lineItems ?? []).filter(l => String(l.description || '').trim())
  const shown = lines.slice(0, 4)
  const extra = lines.length - shown.length
  const lineBlock = shown.length
    ? [
        'Lines',
        ...shown.map((line, i) => `${i + 1}) ${String(line.description).trim()} — ${formatSmsMoney(line.lineAmount)}`),
        extra > 0 ? `…and ${extra} more` : null,
      ].filter(Boolean)
    : []

  return compactSmsBlocks([
    `${inv.invoiceNumberFormatted} · ${formatSmsStatus(inv.status)}`,
    [inv.customerName, vehicle].filter(Boolean).join('\n'),
    [
      inv.invoiceDate ? `Date ${formatSmsDate(inv.invoiceDate)}` : null,
      inv.dueDate ? `Due ${formatSmsDate(inv.dueDate)}` : null,
      inv.poNumber ? `PO ${inv.poNumber}` : null,
    ].filter(Boolean).join('\n'),
    [
      `Total ${formatSmsMoney(inv.total)}`,
      `Paid ${formatSmsMoney(inv.amountPaid)}`,
      `Balance ${formatSmsMoney(inv.balanceDue)}`,
    ].join('\n'),
    lineBlock.join('\n'),
  ])
}

export function formatSusanSmsInvoiceChoiceLabel(row: {
  invoiceNumberFormatted: string
  customerName: string
  total?: string | number | null
  status: string
}): string {
  return `${row.invoiceNumberFormatted}\n${row.customerName} · ${formatSmsMoney(row.total)} · ${formatSmsStatus(row.status)}`
}

export function formatSusanSmsCustomerCard(row: {
  displayName: string
  accountKind?: string | null
  email?: string | null
  phone?: string | null
  cityState?: string | null
  paymentTerms?: string | null
  openBalance?: string | number | null
  openInvoiceCount?: number | null
  invoiceCount?: number | null
}): string {
  const kind = formatSmsAccountKind(row.accountKind)
  const headline = [row.displayName, [kind, row.cityState].filter(Boolean).join(' · ')].filter(Boolean)
  const contact = [row.email, row.phone].filter(Boolean)
  const billing = [
    row.openBalance != null ? `Open ${formatSmsMoney(row.openBalance)}` : null,
    row.openInvoiceCount != null ? `${row.openInvoiceCount} unpaid invoice${row.openInvoiceCount === 1 ? '' : 's'}` : null,
    row.invoiceCount != null ? `${row.invoiceCount} invoices total` : null,
    row.paymentTerms ? formatSmsPaymentTerms(row.paymentTerms) : null,
  ].filter(Boolean)

  return compactSmsBlocks([
    headline.join('\n'),
    contact.join('\n'),
    billing.join('\n'),
  ])
}

export function formatSusanSmsCustomerChoiceLabel(row: {
  displayName: string
  email?: string | null
  cityState?: string | null
  accountKind?: string | null
}): string {
  const bits = [formatSmsAccountKind(row.accountKind), row.cityState, row.email].filter(Boolean)
  return bits.length ? `${row.displayName}\n${bits.join(' · ')}` : row.displayName
}

export function formatSusanSmsServiceLogCard(log: {
  logNumber: number
  status: string
  customerName: string
  serviceDate?: string | Date | null
  complaint?: string | null
  invoiceNumberFormatted?: string | null
  vehicle?: { busNumber?: string | null, unitTag?: string | null, year?: number | string | null, make?: string | null, model?: string | null } | null
}): string {
  const label = `SL-${String(log.logNumber).padStart(4, '0')}`
  const complaint = String(log.complaint || '').replace(/\s+/g, ' ').trim().slice(0, 160)
  return compactSmsBlocks([
    `${label} · ${formatSmsStatus(log.status)}`,
    [log.customerName, smsVehicleLabel(log.vehicle)].filter(Boolean).join('\n'),
    [
      log.serviceDate ? `Date ${formatSmsDate(log.serviceDate)}` : null,
      log.invoiceNumberFormatted ? `Invoice ${log.invoiceNumberFormatted}` : null,
    ].filter(Boolean).join('\n'),
    complaint ? `Complaint\n${complaint}` : '',
  ])
}

export function formatSusanSmsServiceLogChoiceLabel(row: {
  logNumber: number
  customerName: string
  status: string
}): string {
  return `SL-${String(row.logNumber).padStart(4, '0')}\n${row.customerName} · ${formatSmsStatus(row.status)}`
}

export function formatSusanSmsCatalogItem(row: {
  name: string
  itemType?: string | null
  sku?: string | null
  defaultPrice?: string | number | null
  uom?: string | null
}): string {
  const kind = formatSmsStatus(row.itemType || 'item')
  const sku = row.sku ? ` (${row.sku})` : ''
  const price = row.defaultPrice != null
    ? `${formatSmsMoney(row.defaultPrice)}${row.uom ? ` / ${row.uom}` : ''}`
    : ''
  const detail = [kind, price].filter(Boolean).join(' · ')
  return detail ? `${row.name}${sku}\n${detail}` : `${row.name}${sku}`
}

export function withSmsMoreHint(body: string): string {
  const text = String(body || '').trim()
  if (!text) return SUSAN_SMS_MORE_HINT
  if (/text menu/i.test(text)) return text
  return `${text}\n\n${SUSAN_SMS_MORE_HINT}`
}

function smsVehicleLabel(vehicle: {
  busNumber?: string | null
  unitTag?: string | null
  year?: number | string | null
  make?: string | null
  model?: string | null
} | null | undefined): string {
  if (!vehicle) return ''
  const unit = vehicle.busNumber || vehicle.unitTag
  const ymm = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  if (unit && ymm) return `${unit} (${ymm})`
  return unit || ymm || ''
}

function compactSmsBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map(block => String(block || '').trim())
    .filter(Boolean)
    .join('\n\n')
}
