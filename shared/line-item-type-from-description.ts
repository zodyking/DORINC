import type { LineItemType } from './line-item-types'

/** First word implies a physical part install/replace action. */
export const PART_DESCRIPTION_VERBS = [
  'Install', 'Replace', 'Exchange', 'Swap', 'Upgrade', 'Fit', 'Mount', 'Add',
  'Convert', 'Equip', 'Supply', 'Furnish', 'Provide', 'Update', 'Integrate',
  'Assemble', 'Deploy', 'Attach', 'Insert', 'Bolt', 'Secure', 'Wire', 'Connect',
  'Populate', 'Outfit',
] as const

/** First word implies labor / service work. */
export const LABOR_DESCRIPTION_VERBS = [
  'Repair', 'Service', 'Rebuild', 'Diagnose', 'Inspect', 'Test', 'Troubleshoot',
  'Calibrate', 'Adjust', 'Program', 'Configure', 'Clean', 'Lubricate', 'Overhaul',
  'Restore', 'Recondition', 'Recharge', 'Align', 'Balance', 'Flush', 'Bleed',
  'Verify', 'Measure', 'Tune', 'Validate',
] as const

const PART_VERB_SET = new Set(PART_DESCRIPTION_VERBS.map(w => w.toLowerCase()))
const LABOR_VERB_SET = new Set(LABOR_DESCRIPTION_VERBS.map(w => w.toLowerCase()))

export function firstDescriptionWord(description: string): string {
  const match = description.trim().match(/^['"]?([A-Za-z]+)/)
  return match?.[1] ?? ''
}

/** Infer line type from the first word of a description. Returns null when no rule matches. */
export function inferLineTypeFromDescription(description: string): LineItemType | null {
  const word = firstDescriptionWord(description).toLowerCase()
  if (!word) return null
  if (PART_VERB_SET.has(word)) return 'part'
  if (LABOR_VERB_SET.has(word)) return 'labor'
  return null
}
