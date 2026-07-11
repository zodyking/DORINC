/** Parse `"Shop Name" <email@domain.com>` or plain email into parts. */
export function parseSmtpFromHeader(from: string): { fromName: string, fromAddress: string } {
  const trimmed = from.trim()
  if (!trimmed) return { fromName: '', fromAddress: '' }

  const angle = trimmed.match(/^(.+?)\s*<([^>]+)>$/)
  if (angle) {
    const rawName = angle[1]!.trim().replace(/^["']|["']$/g, '')
    return { fromName: rawName, fromAddress: angle[2]!.trim() }
  }

  if (trimmed.includes('@')) {
    return { fromName: '', fromAddress: trimmed }
  }

  return { fromName: trimmed, fromAddress: '' }
}

/** Format inbox From header for SMTP. */
export function formatSmtpFromHeader(fromName: string, fromAddress: string): string {
  const email = fromAddress.trim()
  if (!email) return ''
  const name = fromName.trim().replace(/"/g, '')
  return name ? `"${name}" <${email}>` : email
}
