import {
  calcLineAmount,
  qtyLabelForLineType,
  rateLabelForLineType,
  type WizardLineDraft,
  type WizardLineType,
} from './line-item-wizard-ui'
import { normalizeLineType } from '#shared/line-item-types'
import { lineTypeLabel } from './invoices-ui'

export type SpeechLineField = 'command' | 'pick' | 'type' | 'description' | 'qty' | 'rate' | 'confirm'

export function promptForCommandMode(lineCount: number): string {
  if (lineCount === 0) return promptForSpeechField('type', '')
  return 'Say add line, or edit line item number.'
}

export function retryPromptForCommandMode(): string {
  return 'Say add line, or edit line item number.'
}

export function promptForSpeechField(field: SpeechLineField, lineType: WizardLineType | ''): string {
  switch (field) {
    case 'command':
      return 'Say add line, or edit line item number.'
    case 'pick':
      return 'Say type, description, quantity, rate, save, or cancel.'
    case 'type':
      return 'Labor, part, or fee?'
    case 'description':
      return 'What was done?'
    case 'qty':
      return lineType === 'labor' ? 'How many hours?' : 'How many?'
    case 'rate':
      return lineType === 'labor' ? 'Rate per hour?' : 'What is the price?'
    case 'confirm':
      return 'Say save to finish, or add another for more lines.'
  }
}

export function retryPromptForField(field: SpeechLineField): string {
  switch (field) {
    case 'command':
      return retryPromptForCommandMode()
    case 'pick':
      return retryPromptForEditPick()
    case 'type':
      return 'Say labor, part, or fee. Say cancel to go back.'
    case 'description':
      return 'Tell me what was done, or say keep. Say cancel to go back.'
    case 'qty':
      return 'Give me the number of hours or quantity, or say keep. Say cancel to go back.'
    case 'rate':
      return 'Give me the rate or price, or say keep. Say cancel to go back.'
    case 'confirm':
      return 'Say save, or cancel to go back.'
  }
}

export function parseSpokenLineType(spoken: string): WizardLineType | null {
  const t = spoken.toLowerCase()
  if (/\blabor\b/.test(t)) return 'labor'
  if (/\bparts?\b/.test(t)) return 'part'
  if (/\bfees?\b/.test(t)) return 'fee'
  if (/\bservices?\b/.test(t)) return 'labor'
  return null
}

export function parseSpokenNumber(spoken: string): string {
  const words = spoken.toLowerCase().trim()
  const wordMap: Record<string, string> = {
    one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    half: '0.5',
  }
  for (const [word, num] of Object.entries(wordMap)) {
    if (words === word || words.startsWith(`${word} `)) return num
  }
  const m = words.replace(/,/g, '').replace(/\$/g, '').match(/(\d+(?:\.\d+)?)/)
  return m ? m[1]! : words
}

export function parseSpokenConfirm(spoken: string): 'save' | 'another' | null {
  const t = spoken.toLowerCase()
  if (/\b(another|more|next|add)\b/.test(t)) return 'another'
  if (/\b(save|done|finish|yes|okay|ok)\b/.test(t)) return 'save'
  return null
}

const SPOKEN_INDEX_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
}

const EDIT_VERBS = /\b(edit(?:ed|ing)?|audit(?:ing)?|review(?:ing)?|change(?:d|ing)?|fix(?:ed|ing)?|modify(?:ing)?|update(?:d|ing)?|open|select|go\s+to)\b/

export function parseSpokenAddLineCommand(spoken: string): boolean {
  const t = spoken.toLowerCase()
  return (
    /\b(add|new|another|more)\b/.test(t) && /\b(line|item|charge)\b/.test(t)
  ) || /\badd\s+(a\s+)?(new\s+)?(line|item)\b/.test(t)
    || /\banother\s+(line|item)\b/.test(t)
}

export function parseSpokenEditLineNumber(spoken: string, lineCount: number): number | null {
  if (lineCount < 1) return null
  const t = spoken.toLowerCase().replace(/['']/g, '').trim()

  const hasEditVerb = EDIT_VERBS.test(t)
  const hasLineRef = /\b(line|item)\b/.test(t)
    || /\b(number|#|no\.?)\s*(\d+|one|two|three|four|five|first|second|third)\b/.test(t)
    || /\b(one|two|three|four|five|first|second|third)\b/.test(t)

  if (!hasEditVerb && !hasLineRef) return null
  if (/\b(add|new|another|more)\b/.test(t) && !hasEditVerb) return null

  const digitPatterns = [
    /(?:line\s*item|item|line)\s*(?:number|#|no\.?)?\s*(\d+)/,
    /(?:number|#|no\.?)\s*(\d+)/,
    /\bline\s*(\d+)\b/,
    /\bitem\s*(\d+)\b/,
    /\b(\d+)\b/,
  ]
  for (const pat of digitPatterns) {
    const m = t.match(pat)
    if (m) {
      const n = Number.parseInt(m[1]!, 10)
      if (n >= 1 && n <= lineCount) return n - 1
    }
  }

  for (const [word, n] of Object.entries(SPOKEN_INDEX_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) {
      return n >= 1 && n <= lineCount ? n - 1 : null
    }
  }

  // "edit the line" / "edit line item" with no number → only line when count is 1
  if (hasEditVerb && lineCount === 1 && hasLineRef) return 0

  return null
}

export function parseSpokenCancel(spoken: string): boolean {
  const t = spoken.toLowerCase().trim().replace(/['']/g, '')
  return /\b(cancel(?:led|ed|ing)?|never\s*mind|nevermind|go\s*back|stop\s*edit(?:ing)?|abort|exit|quit|forget\s*it|scratch\s*that|start\s*over|undo|back\s*out)\b/.test(t)
    || /^(stop|back|cancel|nevermind|never mind|abort|quit)$/.test(t)
}

/** In edit mode: jump to a field, or save. */
export function parseSpokenEditField(spoken: string): 'type' | 'description' | 'qty' | 'rate' | 'confirm' | null {
  const t = spoken.toLowerCase().trim().replace(/['']/g, '')
  if (/\b(save|done|finish|keep\s*changes|that'?s?\s*good|looks\s*good|all\s*set)\b/.test(t)) return 'confirm'
  if (/\b(edit|change|update)\s+(the\s+)?(type|item\s*type|line\s*type)\b/.test(t)) return 'type'
  if (/\b(edit|change|update)\s+(the\s+)?(description|desc)\b/.test(t)) return 'description'
  if (/\b(edit|change|update)\s+(the\s+)?(quantity|qty|hours|hour)\b/.test(t)) return 'qty'
  if (/\b(edit|change|update)\s+(the\s+)?(rate|price|cost|charge)\b/.test(t)) return 'rate'
  if (/\b(item\s*type|line\s*type)\b/.test(t) || t === 'type') return 'type'
  if (/\b(description|desc|what\s*(was|is)\s*done)\b/.test(t)) return 'description'
  if (/\b(quantity|qty|quantities|hours|hour)\b/.test(t)) return 'qty'
  if (/\b(rate|price|cost|charge|amount)\b/.test(t)) return 'rate'
  return null
}

export function promptForEditPick(
  draft: { lineType: WizardLineType | '', description: string, qty: string, rate: string },
  lineNumber: number,
): string {
  const n = lineNumber + 1
  const qtyLabel = draft.lineType === 'labor' ? 'hours' : 'quantity'
  return `Line ${n}: ${lineTypeLabel(normalizeLineType(draft.lineType))}, ${draft.description}, ${qtyLabel} ${draft.qty}, rate ${draft.rate}. Say type, description, ${qtyLabel}, or rate to edit. Say save when done, or cancel to go back.`
}

export function retryPromptForEditPick(): string {
  return 'Say type, description, quantity, rate, save, or cancel.'
}

export function parseKeepCurrent(spoken: string): boolean {
  return /\b(same|keep|correct|skip|unchanged|leave)\b/i.test(spoken)
}

export function promptForEditField(
  field: SpeechLineField,
  draft: { lineType: WizardLineType | '', description: string, qty: string, rate: string },
  lineNumber: number,
): string {
  const n = lineNumber + 1
  switch (field) {
    case 'pick':
      return promptForEditPick(draft, lineNumber)
    case 'type':
      return `Type is ${lineTypeLabel(normalizeLineType(draft.lineType))}. Say labor, part, or fee to change. Say cancel to go back.`
    case 'description':
      return `Description is ${draft.description}. Say the new description, or say keep. Say cancel to go back.`
    case 'qty':
      return draft.lineType === 'labor'
        ? `Hours are ${draft.qty}. Say the new hours, or say keep. Say cancel to go back.`
        : `Quantity is ${draft.qty}. Say the new quantity, or say keep. Say cancel to go back.`
    case 'rate':
      return `Rate is ${draft.rate}. Say the new rate, or say keep. Say cancel to go back.`
    case 'confirm':
      return 'Say save to keep changes, or cancel to go back.'
    default:
      return promptForSpeechField(field, draft.lineType)
  }
}

export function fieldLabel(field: SpeechLineField, lineType: WizardLineType | ''): string {
  switch (field) {
    case 'command': return 'Command'
    case 'pick': return 'Edit menu'
    case 'type': return 'Type'
    case 'description': return 'Description'
    case 'qty': return lineType ? qtyLabelForLineType(lineType) : 'Quantity'
    case 'rate': return lineType ? rateLabelForLineType(lineType) : 'Rate'
    case 'confirm': return 'Confirm'
  }
}

export function buildLineFromDraft(draft: {
  lineType: WizardLineType | ''
  description: string
  qty: string
  rate: string
}): WizardLineDraft | null {
  if (!draft.lineType || !draft.description.trim()) return null
  const amount = calcLineAmount(draft.qty, draft.rate)
  return {
    lineType: draft.lineType,
    description: draft.description.trim(),
    qty: draft.qty.trim(),
    rate: draft.rate.trim(),
    amount,
  }
}
