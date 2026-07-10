// Invoice editor helpers (mockup: PAGE: INVOICE EDITOR / P1-24).

import { normalizeLineType } from '#shared/line-item-types'
import { inferLineTypeFromDescription } from '#shared/line-item-type-from-description'
import type { InvoiceLineType } from './invoices-ui'
import { moneyDisplay, paymentTermsLabel } from './invoices-ui'
import type { LineTypeBreakdown } from './invoice-creator-ui'

/** Heartbeat interval — SPEC §12: 15–30s. */
export const EDIT_SESSION_HEARTBEAT_MS = 20_000

/** Observer poll interval — keep status fresh between heartbeats. */
export const EDIT_SESSION_STATUS_POLL_MS = 15_000

export interface InvoiceTotalsShape {
  subtotal: string
  taxAmount: string
  taxExempt: boolean
  feesAmount: string
  shopSuppliesPercent: string | null
  discountAmount: string
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
  if (itemType === 'part' || itemType === 'fee') return itemType
  return 'labor'
}

/** Fill type / description / qty / rate from a catalog pick (creator + editor autocomplete). */
export function applyCatalogItemToLineFields(item: CatalogQuickItem): {
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  catalogItemId: string
} {
  return {
    lineType: (() => {
      const fromCatalog = catalogTypeToLineType(item.itemType)
      return inferLineTypeFromDescription(item.name) ?? fromCatalog
    })(),
    description: item.name,
    quantity: '1',
    unitPrice: item.defaultPrice ?? '0',
    catalogItemId: item.id,
  }
}

/** Server totals rows for editor sidebar — never computed client-side. */
export function editorSummaryRows(
  inv: InvoiceTotalsShape,
  opts: { breakdown?: LineTypeBreakdown, grandLabel?: string } = {},
): { label: string, value: string, grand?: boolean }[] {
  const rows: { label: string, value: string, grand?: boolean }[] = []
  if (opts.breakdown) {
    rows.push(
      { label: 'Parts', value: moneyDisplay(opts.breakdown.parts) },
      { label: 'Labor', value: moneyDisplay(opts.breakdown.labor) },
      { label: 'Fees', value: moneyDisplay(opts.breakdown.fees) },
    )
  }
  rows.push({ label: 'Subtotal', value: moneyDisplay(inv.subtotal) })
  if (inv.feesAmount && Number.parseFloat(inv.feesAmount) > 0) {
    rows.push({ label: 'Shop supplies & fees', value: moneyDisplay(inv.feesAmount) })
  }
  else if (inv.shopSuppliesPercent && Number.parseFloat(inv.shopSuppliesPercent) > 0) {
    rows.push({ label: `Shop supplies (${inv.shopSuppliesPercent}%)`, value: 'Included in fees' })
  }
  const taxLabel = inv.taxExempt ? 'Tax (exempt)' : 'Tax'
  rows.push({ label: taxLabel, value: moneyDisplay(inv.taxAmount) })
  if (inv.discountAmount && Number.parseFloat(inv.discountAmount) > 0) {
    rows.push({ label: 'Discount', value: moneyDisplay(inv.discountAmount, { signed: true }) })
  }
  rows.push({ label: opts.grandLabel ?? 'Total', value: moneyDisplay(inv.total), grand: true })
  return rows
}

export function customerTermsHelp(terms: string, accountKind?: string | null): string {
  const parts = [paymentTermsLabel(terms)]
  if (accountKind) parts.push(accountKind.replace(/_/g, ' '))
  return `Terms from account: ${parts.join(' · ')}`
}

export function formatHistoryChange(action: string, afterData: Record<string, unknown> | null): string {
  if (action === 'invoices.create') return 'Invoice created'
  if (action === 'invoices.update') return 'Autosaved draft · header updated'
  if (action === 'invoices.line_items.create') {
    const desc = afterData?.description
    return typeof desc === 'string' ? `Added line · ${desc}` : 'Added line item'
  }
  if (action === 'invoices.line_items.update') return 'Line items recalculated'
  if (action === 'invoices.line_items.delete') return 'Removed line item'
  return action.replace(/\./g, ' ')
}
