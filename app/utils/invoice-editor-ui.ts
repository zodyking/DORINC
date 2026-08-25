// Invoice editor helpers (mockup: PAGE: INVOICE EDITOR / P1-24).

import { addMoney, subtractMoney } from '#shared/money'
import { computeWaivedTaxAmount, taxableSubtotalFromLines, type TaxableLineInput } from '#shared/invoice-tax-exempt'
import { resolveInvoiceDiscount } from '#shared/invoice-discount'
import { formatAuditChangeMessage, type AuditMessageInput } from '#shared/audit-messages'
import { normalizeLineType } from '#shared/line-item-types'
import { inferLineTypeFromDescription } from '#shared/line-item-type-from-description'
import { getLineTypeVerbsCache } from './detection-settings-store'
import type { InvoiceLineType } from './invoices-ui'
import { moneyDisplay, paymentTermsLabel } from './invoices-ui'
import type { LineTypeBreakdown } from './invoice-creator-ui'

/** Heartbeat interval — SPEC §12: 15–30s. */
export const EDIT_SESSION_HEARTBEAT_MS = 20_000

/** Observer poll interval — keep status fresh between heartbeats. */
export const EDIT_SESSION_STATUS_POLL_MS = 15_000

export interface InvoiceSummaryRow {
  label: string
  value: string
  grand?: boolean
  strikethrough?: boolean
  note?: string
}

export interface InvoiceTotalsShape {
  subtotal: string
  taxAmount: string
  taxExempt: boolean
  waivedTaxAmount?: string | null
  discountAmount: string
  discountPercent?: string | null
  total: string
}

export interface CatalogQuickItem {
  id: string
  itemType: string
  sku: string | null
  name: string
  defaultPrice: string | null
  uom: string
}

/** Relative autosave label — mockup: "autosaved 12 seconds ago". */
export function autosavedLabel(savedAt: Date | null, now = Date.now()): string {
  if (!savedAt) return 'Not saved yet'
  const sec = Math.max(0, Math.floor((now - savedAt.getTime()) / 1000))
  if (sec < 8) return 'autosaved just now'
  if (sec < 60) return `autosaved ${sec} seconds ago`
  const min = Math.floor(sec / 60)
  return min === 1 ? 'autosaved 1 minute ago' : `autosaved ${min} minutes ago`
}

export function catalogItemSub(item: CatalogQuickItem): string {
  const price = item.defaultPrice ? `${moneyDisplay(item.defaultPrice)}` : 'No default price'
  const uom = item.uom === 'hr' ? '/ hr' : item.uom === 'each' ? '' : ` · ${item.uom}`
  const sku = item.sku ? ` · ${item.sku}` : ''
  return `${price}${uom}${sku}`
}

export function catalogTypeToLineType(itemType: string): InvoiceLineType {
  return normalizeLineType(itemType)
}

/** Fill type / description / qty / rate from a catalog pick (creator + editor autocomplete). */
export function applyCatalogItemToLineFields(item: CatalogQuickItem, quantity = '1'): {
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  catalogItemId: string
} {
  return {
    lineType: (() => {
      const fromCatalog = catalogTypeToLineType(item.itemType)
      const verbs = getLineTypeVerbsCache() ?? undefined
      return inferLineTypeFromDescription(item.name, verbs) ?? fromCatalog
    })(),
    description: item.name,
    quantity,
    unitPrice: item.defaultPrice ?? '0',
    catalogItemId: item.id,
  }
}

export interface PackageLineItem {
  catalogItemId: string
  itemType: string
  name: string
  defaultPrice: string | null
  uom: string
  quantity: string
}

export function expandPackageItemToLineFields(item: PackageLineItem) {
  return applyCatalogItemToLineFields({
    id: item.catalogItemId,
    itemType: item.itemType,
    sku: null,
    name: item.name,
    defaultPrice: item.defaultPrice,
    uom: item.uom,
  }, item.quantity || '1')
}

/** Grand total for display — when a line breakdown is present, derive from live lines. */
export function invoiceDisplayTotal(
  inv: InvoiceTotalsShape,
  breakdown?: LineTypeBreakdown,
): string {
  const lineSubtotal = breakdown
    ? addMoney(breakdown.parts, breakdown.labor, breakdown.fees)
    : inv.subtotal
  const discount = resolveInvoiceDiscount({
    subtotal: lineSubtotal,
    taxAmount: inv.taxAmount ?? '0',
    discountAmount: inv.discountAmount,
    discountPercent: inv.discountPercent,
  })
  return subtractMoney(addMoney(lineSubtotal, inv.taxAmount ?? '0'), discount)
}

function resolvedDocumentDiscount(
  inv: InvoiceTotalsShape,
  lineSubtotal: string,
): string {
  return resolveInvoiceDiscount({
    subtotal: lineSubtotal,
    taxAmount: inv.taxAmount ?? '0',
    discountAmount: inv.discountAmount,
    discountPercent: inv.discountPercent,
  })
}

/** Server totals rows for editor sidebar — never computed client-side. */
export function editorSummaryRows(
  inv: InvoiceTotalsShape & { taxRate?: string | null },
  opts: {
    breakdown?: LineTypeBreakdown
    grandLabel?: string
    lineItems?: TaxableLineInput[]
  } = {},
): InvoiceSummaryRow[] {
  const waivedTaxAmount = inv.waivedTaxAmount ?? (inv.taxExempt
    ? computeWaivedTaxAmount({
        taxExempt: true,
        taxRate: inv.taxRate,
        taxableSubtotal: opts.lineItems?.length
          ? taxableSubtotalFromLines(opts.lineItems)
          : '0',
      })
    : null)
  const rows: InvoiceSummaryRow[] = []
  let lineSubtotal = inv.subtotal
  if (opts.breakdown) {
    rows.push(
      { label: 'Parts', value: moneyDisplay(opts.breakdown.parts) },
      { label: 'Labor', value: moneyDisplay(opts.breakdown.labor) },
      { label: 'Fees', value: moneyDisplay(opts.breakdown.fees) },
    )
    lineSubtotal = addMoney(opts.breakdown.parts, opts.breakdown.labor, opts.breakdown.fees)
  }
  rows.push({ label: 'Subtotal', value: moneyDisplay(lineSubtotal) })
  if (inv.taxExempt) {
    const waived = waivedTaxAmount
    if (waived && Number.parseFloat(waived) > 0) {
      rows.push({
        label: 'Tax',
        value: moneyDisplay(waived),
        strikethrough: true,
        note: 'tax exempt',
      })
    }
    else {
      rows.push({ label: 'Tax', value: moneyDisplay('0'), note: 'tax exempt' })
    }
  }
  else {
    rows.push({ label: 'Tax', value: moneyDisplay(inv.taxAmount) })
  }
  const discount = resolvedDocumentDiscount(inv, lineSubtotal)
  rows.push({
    label: 'Discount',
    value: moneyDisplay(discount || '0'),
  })
  rows.push({
    label: opts.grandLabel ?? 'Total',
    value: moneyDisplay(invoiceDisplayTotal(inv, opts.breakdown)),
    grand: true,
  })
  return rows
}

export function invoiceDetailSummaryRows(
  inv: InvoiceTotalsShape & {
    taxRate?: string | null
    amountPaid?: string
    balanceDue?: string
    lineItems?: TaxableLineInput[]
    lineTypeBreakdown?: LineTypeBreakdown
  },
): InvoiceSummaryRow[] {
  const waivedTaxAmount = inv.waivedTaxAmount ?? (inv.lineItems?.length
    ? computeWaivedTaxAmount({
        taxExempt: inv.taxExempt,
        taxRate: inv.taxRate,
        taxableSubtotal: taxableSubtotalFromLines(inv.lineItems),
      })
    : null)
  const base = editorSummaryRows(
    { ...inv, waivedTaxAmount },
    { breakdown: inv.lineTypeBreakdown, lineItems: inv.lineItems },
  )
  const rows = base.slice(0, -1)
  if (inv.amountPaid && Number.parseFloat(inv.amountPaid) > 0) {
    rows.push({ label: 'Amount paid', value: `−${moneyDisplay(inv.amountPaid)}` })
  }
  rows.push({
    label: 'Balance due',
    value: moneyDisplay(inv.balanceDue ?? inv.total),
    grand: true,
  })
  return rows
}

export function customerTermsHelp(terms: string, accountKind?: string | null): string {
  const parts = [paymentTermsLabel(terms)]
  if (accountKind) parts.push(accountKind.replace(/_/g, ' '))
  return `Terms from account: ${parts.join(' · ')}`
}

export function formatHistoryChange(
  action: string,
  afterData: Record<string, unknown> | null,
  opts: Omit<AuditMessageInput, 'action' | 'afterData'> = {},
): string {
  return formatAuditChangeMessage({
    action,
    afterData,
    ...opts,
  })
}
