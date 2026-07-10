// Catalog list/modal presentation helpers (mockup: PAGE: CATALOG).

export type CatalogItemType = 'part' | 'service' | 'fee'

export const CATALOG_ITEM_TYPE_OPTIONS: { value: CatalogItemType, label: string }[] = [
  { value: 'part', label: 'Part' },
  { value: 'service', label: 'Service' },
  { value: 'fee', label: 'Fee' },
]

/** Normalize legacy catalog rows that still store labor. */
export function normalizeCatalogItemType(type: string): CatalogItemType {
  if (type === 'part' || type === 'fee') return type
  return 'service'
}

export function catalogTypeLabel(type: string): string {
  switch (normalizeCatalogItemType(type)) {
    case 'part': return 'Part'
    case 'service': return 'Service'
    case 'fee': return 'Fee'
  }
}

export function catalogTypePill(type: string): string {
  switch (normalizeCatalogItemType(type)) {
    case 'part': return 'pill ok'
    case 'service': return 'pill info'
    case 'fee': return 'pill gray'
  }
}

/** Format default price for table cells. */
export function catalogPriceDisplay(
  price: string | null | undefined,
  uom: string,
  itemType: string,
): string {
  if (!price) return '—'
  const type = normalizeCatalogItemType(itemType)
  if (type === 'fee' && uom === 'pct') return `${price}%`

  const num = Number.parseFloat(price)
  const formatted = Number.isFinite(num)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
    : price

  if (type === 'service' && uom === 'hr') return `${formatted} / hr`
  if (uom === 'flat') return `${formatted} flat`
  return formatted
}

export const CATALOG_UOM_OPTIONS = [
  { value: 'each', label: 'Each' },
  { value: 'hr', label: 'Per hour' },
  { value: 'flat', label: 'Flat rate' },
  { value: 'pct', label: 'Percent (%)' },
] as const

export function defaultUomForCatalogType(type: CatalogItemType): string {
  switch (type) {
    case 'part': return 'each'
    case 'service': return 'hr'
    case 'fee': return 'pct'
  }
}
