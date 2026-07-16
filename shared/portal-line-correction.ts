export interface PortalLineItemCorrectionPayload {
  lineItemId: string
  original: {
    description: string
    quantity: string
    unitPrice: string
  }
  proposed: {
    description: string
    quantity: string
    unitPrice: string
  }
  notes?: string | null
}

function moneyDisplay(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return value
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n)
}

export function buildPortalLineItemCorrectionDescription(
  invoiceNumberFormatted: string,
  payload: PortalLineItemCorrectionPayload,
): string {
  const { original, proposed, notes } = payload
  const lines = [
    `Invoice: ${invoiceNumberFormatted}`,
    'Line item correction request',
    '',
    'Current:',
    `  Description: ${original.description}`,
    `  Qty/Hours: ${original.quantity}`,
    `  Rate: ${moneyDisplay(original.unitPrice)}`,
    '',
    'Requested:',
    `  Description: ${proposed.description}`,
    `  Qty/Hours: ${proposed.quantity}`,
    `  Rate: ${moneyDisplay(proposed.unitPrice)}`,
  ]
  if (notes?.trim()) {
    lines.push('', `Notes: ${notes.trim()}`)
  }
  return lines.join('\n')
}
