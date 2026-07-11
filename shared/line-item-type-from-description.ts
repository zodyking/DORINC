import type { LineItemType } from './line-item-types'

/** First word implies a physical part install/replace action. */
export const DEFAULT_PART_DESCRIPTION_VERBS = [
  'Install', 'Replace', 'Exchange', 'Swap', 'Upgrade', 'Fit', 'Mount', 'Add',
  'Convert', 'Equip', 'Supply', 'Furnish', 'Provide', 'Update', 'Integrate',
  'Assemble', 'Deploy', 'Attach', 'Insert', 'Bolt', 'Wire', 'Connect',
  'Populate', 'Outfit',
] as const

/** First word implies labor / service work. */
export const DEFAULT_LABOR_DESCRIPTION_VERBS = [
  'Repair', 'Service', 'Rebuild', 'Diagnose', 'Inspect', 'Test', 'Troubleshoot',
  'Calibrate', 'Adjust', 'Program', 'Configure', 'Clean', 'Lubricate', 'Overhaul',
  'Restore', 'Recondition', 'Recharge', 'Align', 'Balance', 'Flush', 'Bleed',
  'Verify', 'Measure', 'Tune', 'Validate',
] as const

/** First word implies a fee / supplies charge. */
export const DEFAULT_FEE_DESCRIPTION_VERBS = [
  'Charge', 'Assess', 'Apply', 'Bill',
] as const

export interface LineTypeVerbConfig {
  part?: readonly string[]
  labor?: readonly string[]
  fee?: readonly string[]
}

function verbSet(words: readonly string[]): Set<string> {
  return new Set(words.map(w => w.toLowerCase()))
}

export function firstDescriptionWord(description: string): string {
  const match = description.trim().match(/^['"]?([A-Za-z]+)/)
  return match?.[1] ?? ''
}

/** Infer line type from the first word of a description. Returns null when no rule matches. */
export function inferLineTypeFromDescription(
  description: string,
  verbs: LineTypeVerbConfig = {},
): LineItemType | null {
  const partSet = verbSet(verbs.part ?? DEFAULT_PART_DESCRIPTION_VERBS)
  const laborSet = verbSet(verbs.labor ?? DEFAULT_LABOR_DESCRIPTION_VERBS)
  const feeSet = verbSet(verbs.fee ?? DEFAULT_FEE_DESCRIPTION_VERBS)

  const word = firstDescriptionWord(description).toLowerCase()
  if (!word) return null
  if (partSet.has(word)) return 'part'
  if (laborSet.has(word)) return 'labor'
  if (feeSet.has(word)) return 'fee'
  return null
}
