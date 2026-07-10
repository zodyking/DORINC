import {
  calcLineAmount,
  qtyLabelForLineType,
  rateLabelForLineType,
  type WizardLineDraft,
  type WizardLineType,
} from './line-item-wizard-ui'
import { normalizeLineType } from '#shared/line-item-types'
import { lineTypeLabel } from './invoices-ui'

export type SpeechLineField = 'command' | 'type' | 'description' | 'qty' | 'rate' | 'confirm'

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
    case 'type':
      return 'Say labor, part, or fee.'
    case 'description':
      return 'Tell me what was done.'
    case 'qty':
      return 'Give me the number of hours or quantity.'
    case 'rate':
      return 'Give me the rate or price.'
    case 'confirm':
      return 'Say save, or add another.'
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

export function parseSpokenAddLineCommand(spoken: string): boolean {
  const t = spoken.toLowerCase()
  return /\b(add|new|another)\b/.test(t) && /\b(line|item|charge)\b/.test(t)
    || /\badd\s+(a\s+)?(new\s+)?line\b/.test(t)
}

export function parseSpokenEditLineNumber(spoken: string, lineCount: number): number | null {
  const t = spoken.toLowerCase()
  if (!/\b(edit|audit|review|change|fix)\b/.test(t)) return null
  const digitMatch = t.match(/(?:line\s*item|item|line)?\s*(?:number|#)?\s*(\d+)/)
  if (digitMatch) {
    const n = Number.parseInt(digitMatch[1]!, 10)
    return n >= 1 && n <= lineCount ? n - 1 : null
  }
  for (const [word, n] of Object.entries(SPOKEN_INDEX_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) {
      return n >= 1 && n <= lineCount ? n - 1 : null
    }
  }
  return null
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
    case 'type':
      return `Line ${n}. Type is ${lineTypeLabel(normalizeLineType(draft.lineType))}. Say labor, part, or fee to change.`
    case 'description':
      return `Description is ${draft.description}. Say the new description, or say keep.`
    case 'qty':
      return draft.lineType === 'labor'
        ? `Hours are ${draft.qty}. Say the new hours, or say keep.`
        : `Quantity is ${draft.qty}. Say the new quantity, or say keep.`
    case 'rate':
      return `Rate is ${draft.rate}. Say the new rate, or say keep.`
    case 'confirm':
      return 'Say save to keep changes, or add another for more lines.'
    default:
      return promptForSpeechField(field, draft.lineType)
  }
}

export function fieldLabel(field: SpeechLineField, lineType: WizardLineType | ''): string {
  switch (field) {
    case 'command': return 'Command'
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
