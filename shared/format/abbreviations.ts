/** Vehicle / location phrases stored as shorthand; speech reads the full phrase aloud. */

export interface AbbreviationEntry {
  /** Stored shorthand (e.g. F/R). */
  abbr: string
  /** Spoken / typed full phrase (e.g. Front Right). */
  full: string
}

export const LOCATION_ABBREVIATIONS: AbbreviationEntry[] = [
  { abbr: 'F/R', full: 'Front Right' },
  { abbr: 'F/L', full: 'Front Left' },
  { abbr: 'R/S', full: 'Right Side' },
  { abbr: 'L/S', full: 'Left Side' },
  { abbr: 'R/R', full: 'Rear Right' },
  { abbr: 'R/L', full: 'Rear Left' },
]

function phrasePattern(full: string): RegExp {
  const words = full.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`\\b${words.join('\\s+')}\\b`, 'gi')
}

function abbrPattern(abbr: string): RegExp {
  const [a, b] = abbr.split('/')
  return new RegExp(`\\b${a}\\s*[\\/\\-]\\s*${b}\\b`, 'gi')
}

/** Compress full phrases to shorthand for storage (typed or dictated). */
export function abbreviatePhrases(value: string): string {
  let out = value
  const sorted = [...LOCATION_ABBREVIATIONS].sort((a, b) => b.full.length - a.full.length)
  for (const { abbr, full } of sorted) {
    out = out.replace(phrasePattern(full), abbr)
  }
  for (const { abbr } of LOCATION_ABBREVIATIONS) {
    out = out.replace(abbrPattern(abbr), abbr)
  }
  return out
}

/** Expand shorthand for speech synthesis only — never shown in stored text. */
export function expandForSpeech(value: string): string {
  let out = value
  for (const { abbr, full } of LOCATION_ABBREVIATIONS) {
    out = out.replace(abbrPattern(abbr), full)
  }
  return out
}
