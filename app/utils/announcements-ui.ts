import { syncFetchErrorMessage } from './fetch-blob-error'

export function isAnnouncementPath(path: string): boolean {
  return path === '/announcements/required' || path.startsWith('/announcements/required/')
}

/** Prefer Zod issue messages over the generic "Request validation failed". */
export function announcementSaveErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    data?: {
      message?: string
      details?: { issues?: Array<{ path?: string, message?: string }> }
      data?: { message?: string, details?: { issues?: Array<{ path?: string, message?: string }> } }
    }
  }
  const details = e.data?.details ?? e.data?.data?.details
  const issues = details?.issues
  if (Array.isArray(issues) && issues.length) {
    const parts = issues
      .map((issue) => {
        const msg = String(issue.message || '').trim()
        if (!msg) return ''
        const path = String(issue.path || '').trim()
        if (!path || path === 'bodyHtml') return msg
        return `${path}: ${msg}`
      })
      .filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  return syncFetchErrorMessage(err, fallback)
}

export function localDateTimeToIso(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  const d = new Date(raw)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

export { announcementBodyHasInlineDataImages } from './announcement-inline-images'

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
