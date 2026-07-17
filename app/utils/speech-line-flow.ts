import {
  calcLineAmount,
  qtyLabelForLineType,
  rateLabelForLineType,
  type WizardLineDraft,
  type WizardLineType,
} from './line-item-wizard-ui'

export type SpeechLineField = 'command' | 'pick' | 'type' | 'description' | 'qty' | 'rate' | 'confirm'

const COMMAND_PROMPT = 'Say add line, edit line, or done when finished.'

function qtySpeechLabel(lineType: WizardLineType | ''): 'hours' | 'quantity' {
  return lineType === 'labor' ? 'hours' : 'quantity'
}

export function promptForCommandMode(lineCount: number): string {
  if (lineCount === 0) return promptForSpeechField('type', '')
  return COMMAND_PROMPT
}

export function retryPromptForCommandMode(): string {
  return COMMAND_PROMPT
}

export function promptForSpeechField(field: SpeechLineField, lineType: WizardLineType | ''): string {
  switch (field) {
    case 'command':
      return COMMAND_PROMPT
    case 'pick':
      return retryPromptForEditPick()
    case 'type':
      return 'Say labor, part, or fee.'
    case 'description':
      return 'Say what was done.'
    case 'qty':
      return lineType === 'labor' ? 'Say hours.' : 'Say quantity.'
    case 'rate':
      return lineType === 'labor' ? 'Say rate per hour.' : 'Say price.'
    case 'confirm':
      return 'Say save, add another, or cancel.'
  }
}

export function retryPromptForField(field: SpeechLineField): string {
  switch (field) {
    case 'command':
      return retryPromptForCommandMode()
    case 'pick':
      return retryPromptForEditPick()
    case 'type':
      return 'Say labor, part, or fee — or cancel.'
    case 'description':
      return 'Say description — or keep — or cancel.'
    case 'qty':
      return 'Say hours or quantity — or keep — or cancel.'
    case 'rate':
      return 'Say rate — or keep — or cancel.'
    case 'confirm':
      return 'Say save, add another, or cancel.'
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
    eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
    twenty: '20', thirty: '30', forty: '40', fifty: '50',
    hundred: '100',
    half: '0.5', quarter: '0.25',
  }
  for (const [word, num] of Object.entries(wordMap)) {
    if (words === word || words.startsWith(`${word} `)) return num
  }
  const m = words.replace(/,/g, '').replace(/\$/g, '').match(/(\d+(?:\.\d+)?)/)
  return m ? m[1]! : ''
}

export function parseSpokenConfirm(spoken: string): 'save' | 'another' | 'done' | null {
  const t = spoken.toLowerCase()
  if (/\b(another|more|next)\b/.test(t) && !/\b(edit|change)\b/.test(t)) return 'another'
  if (/\b(add)\b/.test(t) && /\b(another|more|line|item)\b/.test(t)) return 'another'
  if (/\b(done|finished|that\s+is\s+all|that'?s?\s*all|all\s*done|i'?m\s*done|complete)\b/.test(t)) return 'done'
  if (/\b(save|yes|okay|ok|good|correct)\b/.test(t)) return 'save'
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
    || /\banother\s+(line|item|one)?\b/.test(t)
    || /^add\s+another$/i.test(t.trim())
    || /^another$/i.test(t.trim())
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
  _lineNumber: number,
): string {
  const qtyLabel = qtySpeechLabel(draft.lineType)
  return `Say type, description, ${qtyLabel}, or rate — or done when finished.`
}

export function retryPromptForEditPick(): string {
  return 'Say type, description, hours or quantity, or rate — or done when finished.'
}

export function parseKeepCurrent(spoken: string): boolean {
  return /\b(same|keep|correct|skip|unchanged|leave)\b/i.test(spoken)
}

export function retryPromptForEditField(field: SpeechLineField, lineType: WizardLineType | ''): string {
  switch (field) {
    case 'type':
      return 'Say labor, part, or fee — or cancel.'
    case 'description':
      return 'Say description — or keep — or cancel.'
    case 'qty':
      return lineType === 'labor'
        ? 'Say hours — or keep — or cancel.'
        : 'Say quantity — or keep — or cancel.'
    case 'rate':
      return 'Say rate — or keep — or cancel.'
    case 'confirm':
      return 'Say save or cancel.'
    default:
      return retryPromptForEditPick()
  }
}

export function promptForEditField(
  field: SpeechLineField,
  draft: { lineType: WizardLineType | '', description: string, qty: string, rate: string },
  lineNumber: number,
): string {
  switch (field) {
    case 'pick':
      return promptForEditPick(draft, lineNumber)
    case 'type':
    case 'description':
    case 'qty':
    case 'rate':
    case 'confirm':
      return retryPromptForEditField(field, draft.lineType)
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
