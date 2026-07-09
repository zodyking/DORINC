// Portal account presentation helpers (mockup: Portal Account / P2-08).

export function portalAccountKindLabel(kind: string): string {
  return kind === 'fleet' ? 'Fleet account' : 'Individual account'
}

export function portalMustChangePasswordNote(mustChange: boolean): string | null {
  if (!mustChange) return null
  return 'Replace your temporary credential email password after first login.'
}
