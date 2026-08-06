export function isAnnouncementPath(path: string): boolean {
  return path === '/announcements/required' || path.startsWith('/announcements/required/')
}

export function audienceModeLabel(mode: string): string {
  if (mode === 'all') return 'All staff'
  if (mode === 'account_type') return 'Account types'
  if (mode === 'user') return 'Specific users'
  return mode
}

export interface AnnouncementEditorForm {
  title: string
  subtitle: string
  bodyHtml: string
  heroImageFileId: string | null
  heroImageUrl: string | null
  isActive: boolean
  priority: number
  startsAt: string
  endsAt: string
  audienceMode: 'all' | 'account_type' | 'user'
  accountTypeKeys: string[]
  userIds: string[]
  ctaButtons: Array<{ label: string, href: string, variant: 'primary' | 'secondary' | 'ghost' }>
}
