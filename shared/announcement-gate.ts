/** Pure helpers for announcement audience matching (unit-tested). */

export type AnnouncementAudienceMode = 'all' | 'account_type' | 'user'

export interface AnnouncementTargetRow {
  targetType: AnnouncementAudienceMode
  accountTypeKey?: string | null
  userId?: string | null
}

export function announcementMatchesUser(
  targets: AnnouncementTargetRow[],
  opts: { userId: string, accountTypeKey: string },
): boolean {
  if (!targets.length) return false
  for (const target of targets) {
    if (target.targetType === 'all') return true
    if (target.targetType === 'account_type' && target.accountTypeKey === opts.accountTypeKey) {
      return true
    }
    if (target.targetType === 'user' && target.userId === opts.userId) return true
  }
  return false
}

export function isAnnouncementInWindow(
  opts: { startsAt?: Date | string | null, endsAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (opts.startsAt) {
    const start = opts.startsAt instanceof Date ? opts.startsAt : new Date(opts.startsAt)
    if (Number.isFinite(start.getTime()) && start.getTime() > now.getTime()) return false
  }
  if (opts.endsAt) {
    const end = opts.endsAt instanceof Date ? opts.endsAt : new Date(opts.endsAt)
    if (Number.isFinite(end.getTime()) && end.getTime() < now.getTime()) return false
  }
  return true
}
