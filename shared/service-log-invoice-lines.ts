import { z } from 'zod'
import { multiplyMoney } from './money'
import { normalizeLineType } from './line-item-types'
import { serviceLogDraftLineSchema } from './validators/service-logs'

export type ServiceLogDraftLine = z.infer<typeof serviceLogDraftLineSchema>

export interface ServiceLogDraftLineInvoiceSeed {
  lineType: ReturnType<typeof normalizeLineType>
  description: string
  quantity: string
  unitPrice: string
  lineAmount: string
  sortOrder: number
}

function moneyAmount(quantity: string, unitPrice: string): string {
  try {
    return multiplyMoney(quantity, unitPrice)
  }
  catch {
    return '0'
  }
}

/** Map a service-log draft line into invoice line-item fields. */
export function serviceLogDraftLineToInvoiceSeed(
  line: ServiceLogDraftLine,
  sortOrder: number,
): ServiceLogDraftLineInvoiceSeed | null {
  const description = line.description.trim()
  if (!description) return null

  const quantity = line.qty?.trim() || '1'
  let unitPrice = line.rate?.trim() || ''
  if (!unitPrice && line.amount?.trim()) unitPrice = line.amount.trim()
  if (!unitPrice) unitPrice = '0'

  const lineAmount = line.amount?.trim() || moneyAmount(quantity, unitPrice)

  return {
    lineType: normalizeLineType(line.lineType),
    description,
    quantity,
    unitPrice,
    lineAmount,
    sortOrder,
  }
}

/** Parse and map service-log draft lines for invoice creation. */
export function parseServiceLogDraftLineSeeds(draftLineItems: unknown): ServiceLogDraftLineInvoiceSeed[] {
  if (!Array.isArray(draftLineItems) || !draftLineItems.length) return []

  const parsed = z.array(serviceLogDraftLineSchema).safeParse(draftLineItems)
  if (!parsed.success) return []

  const seeds: ServiceLogDraftLineInvoiceSeed[] = []
  for (const [index, line] of parsed.data.entries()) {
    const seed = serviceLogDraftLineToInvoiceSeed(line, index)
    if (seed) seeds.push(seed)
  }
  return seeds
}
