import { abbreviatePhrases } from './abbreviations'
import { toTitleCase } from './title-case'

export type ProseFieldMode = 'prose' | 'name' | 'address' | 'none'

/** Live typing: capitalize first character and first character after each space. */
export function applyLiveTitleCase(value: string): string {
  if (!value) return value
  let result = ''
  let capitalizeNext = true
  for (const ch of value) {
    if (capitalizeNext && /[a-z]/.test(ch)) {
      result += ch.toLocaleUpperCase('en-US')
      capitalizeNext = false
    }
    else {
      result += ch
      capitalizeNext = ch === ' '
    }
  }
  return result
}

/** Final format on blur / voice capture / server persist. */
export function formatFieldText(value: string, mode: ProseFieldMode = 'prose'): string {
  const trimmed = value.trim()
  if (!trimmed || mode === 'none' || mode === 'address') return trimmed

  if (mode === 'name') return toTitleCase(trimmed)

  const titled = toTitleCase(trimmed)
  return abbreviatePhrases(titled)
}

/** Format dictated or pasted text before writing to a model. */
export function formatVoiceText(value: string, mode: ProseFieldMode = 'prose'): string {
  return formatFieldText(value, mode)
}

export function spellcheckForMode(mode: ProseFieldMode): boolean {
  return mode === 'prose'
}

export function autocapitalizeForMode(mode: ProseFieldMode): string {
  if (mode === 'prose' || mode === 'name') return 'words'
  return 'off'
}
