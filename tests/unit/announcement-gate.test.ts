import { describe, expect, it } from 'vitest'
import {
  announcementMatchesUser,
  isAnnouncementInWindow,
} from '../../shared/announcement-gate'
import {
  normalizeAnnouncementHref,
  sanitizeAnnouncementHtml,
} from '../../shared/announcement-html'

describe('announcement gate matching', () => {
  it('matches all-staff targets', () => {
    expect(announcementMatchesUser(
      [{ targetType: 'all' }],
      { userId: 'u1', accountTypeKey: 'mechanic' },
    )).toBe(true)
  })

  it('matches account type and specific user targets', () => {
    expect(announcementMatchesUser(
      [{ targetType: 'account_type', accountTypeKey: 'manager' }],
      { userId: 'u1', accountTypeKey: 'manager' },
    )).toBe(true)

    expect(announcementMatchesUser(
      [{ targetType: 'account_type', accountTypeKey: 'manager' }],
      { userId: 'u1', accountTypeKey: 'mechanic' },
    )).toBe(false)

    expect(announcementMatchesUser(
      [{ targetType: 'user', userId: 'u1' }],
      { userId: 'u1', accountTypeKey: 'mechanic' },
    )).toBe(true)

    expect(announcementMatchesUser(
      [
        { targetType: 'account_type', accountTypeKey: 'viewer' },
        { targetType: 'user', userId: 'u9' },
      ],
      { userId: 'u1', accountTypeKey: 'mechanic' },
    )).toBe(false)
  })

  it('respects start/end windows', () => {
    const now = new Date('2026-08-06T12:00:00.000Z')
    expect(isAnnouncementInWindow({
      startsAt: '2026-08-06T11:00:00.000Z',
      endsAt: '2026-08-06T13:00:00.000Z',
    }, now)).toBe(true)

    expect(isAnnouncementInWindow({
      startsAt: '2026-08-06T13:00:00.000Z',
    }, now)).toBe(false)

    expect(isAnnouncementInWindow({
      endsAt: '2026-08-06T11:00:00.000Z',
    }, now)).toBe(false)

    // Open-ended active windows stay eligible across the schedule.
    expect(isAnnouncementInWindow({
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: null,
    }, now)).toBe(true)
  })
})

describe('announcement content helpers', () => {
  it('sanitizes scripts from body html', () => {
    const out = sanitizeAnnouncementHtml('<p onclick="alert(1)">Hello</p><script>alert(1)</script>')
    expect(out).toContain('<p>Hello</p>')
    expect(out.toLowerCase()).not.toContain('script')
    expect(out.toLowerCase()).not.toContain('onclick')
  })

  it('normalizes safe hrefs only', () => {
    expect(normalizeAnnouncementHref('/dashboard')).toBe('/dashboard')
    expect(normalizeAnnouncementHref('https://example.com/x')).toBe('https://example.com/x')
    expect(normalizeAnnouncementHref('javascript:alert(1)')).toBeNull()
    expect(normalizeAnnouncementHref('//evil.example')).toBeNull()
  })
})
