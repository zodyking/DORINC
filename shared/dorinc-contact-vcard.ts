/**
 * Build an Apple-friendly vCard for the DORINC / Susan AI Quo number.
 * Quo’s public API cannot send MMS contact cards, so we serve this as a
 * downloadable .vcf that iPhone can Add Contact from.
 */

export const DORINC_CONTACT_DISPLAY_NAME = 'Dorinc'
export const DORINC_CONTACT_PHONE_LABEL = 'Susan Ai'

/** Fold long vCard lines (RFC 2426 / 6350). */
export function foldVCardLine(line: string, max = 75): string {
  if (line.length <= max) return line
  let out = line.slice(0, max)
  let rest = line.slice(max)
  while (rest.length) {
    out += `\r\n ${rest.slice(0, max - 1)}`
    rest = rest.slice(max - 1)
  }
  return out
}

export function buildDorincContactVCard(input: {
  phoneE164: string
  /** Raw image bytes for PHOTO; PNG or JPEG. */
  photo?: { bytes: Buffer | Uint8Array, contentType: 'image/png' | 'image/jpeg' } | null
  orgName?: string
}): string {
  const phone = String(input.phoneE164 || '').trim()
  const org = (input.orgName || 'DORINC').trim() || 'DORINC'
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${DORINC_CONTACT_DISPLAY_NAME}`,
    `N:${DORINC_CONTACT_DISPLAY_NAME};;;;`,
    `ORG:${org}`,
  ]

  if (phone) {
    // Apple Address Book custom label (shows as "Susan Ai" instead of mobile/work).
    lines.push(`item1.TEL;type=pref:${phone}`)
    lines.push(`item1.X-ABLabel:${DORINC_CONTACT_PHONE_LABEL}`)
  }

  if (input.photo?.bytes?.length) {
    const b64 = Buffer.from(input.photo.bytes).toString('base64')
    const type = input.photo.contentType === 'image/jpeg' ? 'JPEG' : 'PNG'
    lines.push(foldVCardLine(`PHOTO;ENCODING=b;TYPE=${type}:${b64}`))
  }

  lines.push('END:VCARD')
  return `${lines.join('\r\n')}\r\n`
}
