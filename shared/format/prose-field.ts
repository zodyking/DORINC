import { abbreviatePhrases } from './abbreviations'
import { toTitleCase } from './title-case'

export type ProseFieldMode = 'prose' | 'name' | 'address' | 'none'

/** Live typing: title case + abbreviations (prose) without trimming trailing spaces. */
export function formatLiveFieldText(value: string, mode: ProseFieldMode = 'prose'): string {
  if (!value || mode === 'none' || mode === 'address') return value
  const trailing = value.match(/\s+$/)?.[0] ?? ''
  const core = value.trimEnd()
  if (!core) return value
  if (mode === 'name') return toTitleCase(core) + trailing
  // Skip legacy alias migration while typing so backspacing R/Rear → R/R does not snap back.
  return abbreviatePhrases(toTitleCase(core), { migrateLegacy: false }) + trailing
}

export function adjustCursorAfterFormat(oldVal: string, newVal: string, cursor: number): number {
  if (oldVal === newVal) return cursor
  return Math.max(0, Math.min(newVal.length, cursor + (newVal.length - oldVal.length)))
}

/** Final format on blur / voice capture / server persist. */
export function formatFieldText(value: string, mode: ProseFieldMode = 'prose'): string {
  const trimmed = value.trim()
  if (!trimmed || mode === 'none' || mode === 'address') return trimmed

  if (mode === 'name') return toTitleCase(trimmed)

  return abbreviatePhrases(toTitleCase(trimmed), { migrateLegacy: true })
}

/** Format dictated or pasted text before writing to a model. */
export function formatVoiceText(value: string, mode: ProseFieldMode = 'prose'): string {
  return formatFieldText(value, mode)
}

export function autocapitalizeForMode(mode: ProseFieldMode): string {
  if (mode === 'prose' || mode === 'name') return 'words'
  return 'off'
}
