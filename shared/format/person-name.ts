import { toTitleCase } from './title-case'

export { toTitleCase }

/** Title-case a single word or hyphenated name segment (e.g. "mary-jane" → "Mary-Jane"). */
export function formatPersonName(firstName: string, lastName: string): string {
  return [toTitleCase(firstName), toTitleCase(lastName)].filter(Boolean).join(' ')
}

/** Short attribution label — first name + last initial (e.g. "Anthony P."). */
export function formatPersonNameShort(fullName: string): string {
  const { firstName, lastName } = splitPersonName(fullName)
  if (!firstName) return ''
  const lastInitial = lastName ? `${lastName.charAt(0).toUpperCase()}.` : ''
  return [toTitleCase(firstName), lastInitial].filter(Boolean).join(' ')
}

/** Split stored full name into first/last for profile forms (last name may be multi-word). */
export function splitPersonName(fullName: string): { firstName: string, lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
}
