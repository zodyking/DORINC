/** Vehicle / location phrases stored as shorthand; speech reads the full phrase aloud. */

export interface AbbreviationEntry {
  /** Stored shorthand (e.g. R/Front). */
  abbr: string
  /** Spoken / typed full phrase (e.g. Front Right). */
  full: string
  /** Older shorthand forms that normalize to `abbr` when typed. */
  aliases?: string[]
}

export const LOCATION_ABBREVIATIONS: AbbreviationEntry[] = [
  { abbr: 'R/Front', full: 'Front Right', aliases: ['F/R'] },
  { abbr: 'L/Front', full: 'Front Left', aliases: ['F/L'] },
  { abbr: 'R/Side', full: 'Right Side', aliases: ['R/S'] },
  { abbr: 'L/Side', full: 'Left Side', aliases: ['L/S'] },
  { abbr: 'R/Rear', full: 'Rear Right', aliases: ['R/R'] },
  { abbr: 'L/Rear', full: 'Rear Left', aliases: ['R/L'] },
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function phrasePattern(full: string): RegExp {
  const words = full.split(/\s+/).map(escapeRegExp)
  return new RegExp(`\\b${words.join('\\s+')}\\b`, 'gi')
}

function reversedPhrase(full: string): string {
  return full.split(/\s+/).reverse().join(' ')
}

function abbrPattern(abbr: string): RegExp {
  const [a, b] = abbr.split('/')
  return new RegExp(`\\b${escapeRegExp(a!)}\\s*[\\/\\-]\\s*${escapeRegExp(b!)}\\b`, 'gi')
}

/** Compress full phrases to shorthand for storage (typed or dictated). */
export function abbreviatePhrases(value: string): string {
  let out = value
  const sorted = [...LOCATION_ABBREVIATIONS].sort((a, b) => b.full.length - a.full.length)
  for (const { abbr, full } of sorted) {
    out = out.replace(phrasePattern(full), abbr)
    const reversed = reversedPhrase(full)
    if (reversed !== full) {
      out = out.replace(phrasePattern(reversed), abbr)
    }
  }
  for (const { abbr, aliases } of LOCATION_ABBREVIATIONS) {
    out = out.replace(abbrPattern(abbr), abbr)
    for (const alias of aliases ?? []) {
      out = out.replace(abbrPattern(alias), abbr)
    }
  }
  return out
}

/** Expand shorthand for speech synthesis only — never shown in stored text. */
export function expandForSpeech(value: string): string {
  let out = value
  for (const { abbr, full, aliases } of LOCATION_ABBREVIATIONS) {
    out = out.replace(abbrPattern(abbr), full)
    for (const alias of aliases ?? []) {
      out = out.replace(abbrPattern(alias), full)
    }
  }
  return out
}
