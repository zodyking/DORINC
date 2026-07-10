/** Invoice, estimate, and service-log line item types. */
export const LINE_ITEM_TYPES = ['part', 'labor', 'fee'] as const
export type LineItemType = (typeof LINE_ITEM_TYPES)[number]

/** Legacy `service` lines are treated as labor everywhere. */
export function normalizeLineType(value: string | null | undefined): LineItemType {
  const t = String(value ?? '').trim().toLowerCase()
  if (t === 'service') return 'labor'
  if ((LINE_ITEM_TYPES as readonly string[]).includes(t)) return t as LineItemType
  return 'labor'
}

export function isLineItemType(value: string): value is LineItemType {
  return (LINE_ITEM_TYPES as readonly string[]).includes(value)
}
