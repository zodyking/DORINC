// Catalog list/modal presentation helpers (mockup: PAGE: CATALOG).

export type CatalogItemType = 'part' | 'service' | 'fee' | 'labor'

export function catalogTypeLabel(type: CatalogItemType): string {
  switch (type) {
    case 'part': return 'Part'
    case 'service': return 'Service'
    case 'fee': return 'Fee'
    case 'labor': return 'Labor'
  }
}

export function catalogTypePill(type: CatalogItemType): string {
  switch (type) {
    case 'part': return 'pill ok'
    case 'service': return 'pill info'
    case 'fee': return 'pill gray'
    case 'labor': return 'pill info'
  }
}

/** Format default price for table cells (mockup: $145.00 / hr, 3.5%, $412.68). */
export function catalogPriceDisplay(
  price: string | null | undefined,
  uom: string,
  itemType: CatalogItemType,
): string {
  if (!price) return '—'
  if (itemType === 'fee' && uom === 'pct') return `${price}%`

  const num = Number.parseFloat(price)
  const formatted = Number.isFinite(num)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
    : price

  if (itemType === 'labor' && uom === 'hr') return `${formatted} / hr`
  if (uom === 'flat') return `${formatted} flat`
  return formatted
}

export const CATALOG_UOM_OPTIONS = [
  { value: 'each', label: 'Each' },
  { value: 'hr', label: 'Per hour' },
  { value: 'flat', label: 'Flat rate' },
  { value: 'pct', label: 'Percent (%)' },
  { value: 'gal', label: 'Per gallon' },
  { value: 'lb', label: 'Per pound' },
] as const
