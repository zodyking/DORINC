/** Title-case a single word or hyphenated name segment (e.g. "mary-jane" → "Mary-Jane"). */
export function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word =>
      word
        .split('-')
        .map(part => (part ? part.charAt(0).toLocaleUpperCase('en-US') + part.slice(1).toLocaleLowerCase('en-US') : ''))
        .join('-'),
    )
    .join(' ')
}

export function formatPersonName(firstName: string, lastName: string): string {
  return [toTitleCase(firstName), toTitleCase(lastName)].filter(Boolean).join(' ')
}
