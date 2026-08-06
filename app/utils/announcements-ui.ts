export function isAnnouncementPath(path: string): boolean {
  return path === '/announcements/required' || path.startsWith('/announcements/required/')
}

export function audienceModeLabel(mode: string): string {
  if (mode === 'all') return 'All staff'
  if (mode === 'account_type') return 'Account types'
  if (mode === 'user') return 'Specific users'
  return mode
}
