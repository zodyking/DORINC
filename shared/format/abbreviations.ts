/** Vehicle / location shorthand → full phrase (stored and displayed expanded). */

export interface AbbreviationEntry {
  /** Canonical full phrase. */
  full: string
  /** Patterns matched case-insensitively (slashes, spaces, hyphens flexible). */
  patterns: RegExp[]
}

export const LOCATION_ABBREVIATIONS: AbbreviationEntry[] = [
  {
    full: 'Front Right',
    patterns: [/\bF\s*[\/\-]\s*R\b/gi],
  },
  {
    full: 'Front Left',
    patterns: [/\bF\s*[\/\-]\s*L\b/gi],
  },
  {
    full: 'Right Side',
    patterns: [/\bR\s*[\/\-]\s*S\b/gi],
  },
  {
    full: 'Left Side',
    patterns: [/\bL\s*[\/\-]\s*S\b/gi],
  },
  {
    full: 'Rear Right',
    patterns: [/\bR\s*[\/\-]\s*R\b/gi],
  },
  {
    full: 'Rear Left',
    patterns: [/\bR\s*[\/\-]\s*L\b/gi],
  },
]

/** Expand location abbreviations in prose (typed or dictated). */
export function expandAbbreviations(value: string): string {
  let out = value
  for (const { full, patterns } of LOCATION_ABBREVIATIONS) {
    for (const pattern of patterns) {
      out = out.replace(pattern, full)
    }
  }
  return out
}

/** Prepare text for speech synthesis — abbreviations always read as full phrases. */
export function expandForSpeech(value: string): string {
  return expandAbbreviations(value)
}
