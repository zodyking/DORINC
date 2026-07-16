/** Title-case one token segment, preserving user-entered runs of 2+ consecutive uppercase letters. */
export function titleCaseSegment(segment: string): string {
  if (!segment) return ''

  if (segment.includes('.')) {
    return segment
      .split('.')
      .map(part => titleCaseSegment(part))
      .join('.')
  }

  const chars = [
    segment.charAt(0).toLocaleUpperCase('en-US'),
    ...segment.slice(1).toLocaleLowerCase('en-US').split(''),
  ]

  const isAllCapsToken = segment === segment.toUpperCase() && /[A-Z]/.test(segment)
  const upperRun = /[A-Z]{2,}/g
  let match: RegExpExecArray | null

  while ((match = upperRun.exec(segment))) {
    const start = match.index
    const len = match[0].length
    // Long all-caps tokens (e.g. BNOS) are title-cased; short acronyms (INC, LLC, VIN) stay uppercase.
    if (isAllCapsToken && start === 0 && len > 3) continue

    for (let i = 0; i < len; i++) {
      const idx = start + i
      if (idx < chars.length) {
        chars[idx] = segment[idx]!.toLocaleUpperCase('en-US')
      }
    }
  }

  return chars.join('')
}

/** Title-case words and hyphenated parts (e.g. "mary-jane" → "Mary-Jane"). */
export function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word =>
      word
        .split('-')
        .map(titleCaseSegment)
        .join('-'),
    )
    .join(' ')
}
