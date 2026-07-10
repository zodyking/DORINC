import {
  calcLineAmount,
  qtyLabelForLineType,
  rateLabelForLineType,
  type WizardLineDraft,
  type WizardLineType,
} from './line-item-wizard-ui'

export type SpeechLineField = 'type' | 'description' | 'qty' | 'rate' | 'confirm'

export function promptForSpeechField(field: SpeechLineField, lineType: WizardLineType | ''): string {
  switch (field) {
    case 'type':
      return 'Labor, part, service, or fee?'
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
    case 'type':
      return 'Say labor, part, service, or fee.'
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
  if (/\bservices?\b/.test(t)) return 'service'
  if (/\bfees?\b/.test(t)) return 'fee'
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

export function fieldLabel(field: SpeechLineField, lineType: WizardLineType | ''): string {
  switch (field) {
    case 'type': return 'Item type'
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
