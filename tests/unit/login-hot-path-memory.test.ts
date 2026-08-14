import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('post-login hot path must not N+1 or load blobs', () => {
  it('counts email unread with one SQL aggregate, not a per-thread loop', () => {
    const src = readFileSync(resolve('server/services/email-inbox.service.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function countEmailUnread'))
    expect(fn).toContain('SELECT COUNT(*)::text AS value')
    expect(fn).not.toContain('for (const thread of threads)')
    expect(fn).not.toContain('.from(emailThreads)')
  })

  it('counts DM/team unread with one SQL aggregate', () => {
    const src = readFileSync(resolve('server/services/messages.service.ts'), 'utf8')
    const start = src.indexOf('export async function getUnreadCount')
    const end = src.indexOf('export async function listStaffUsers')
    const fn = src.slice(start, end)
    expect(fn).toContain('SELECT COUNT(*)::text AS value')
    expect(fn).toContain('COALESCE(cp.last_read_at, cp.joined_at)')
    expect(fn).not.toContain('last_read_at IS NULL')
    expect(fn).not.toContain('syncTeamChatParticipants')
    expect(fn).not.toContain('countUnreadSince')
    expect(fn).not.toContain('for (const row of participantRows)')
  })

  it('does not count the whole inbox as unread for a brand-new staff user', () => {
    const src = readFileSync(resolve('server/services/email-inbox.service.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function countEmailUnread'))
    expect(fn).toContain('COALESCE(r.last_read_at, u.created_at)')
    expect(fn).not.toContain('r.last_read_at IS NULL')
  })

  it('does not select email html_body on the message list path', () => {
    const src = readFileSync(resolve('server/services/email-inbox.service.ts'), 'utf8')
    const fn = src.slice(
      src.indexOf('export async function listEmailMessages'),
      src.indexOf('export async function getEmailMessageHtml'),
    )
    expect(fn).toContain('length(btrim(${emailMessageMeta.htmlBody}))')
    expect(fn).not.toContain('htmlBody: emailMessageMeta.htmlBody')
  })

  it('keeps announcement gate /me payload free of body_html', () => {
    const src = readFileSync(resolve('server/services/announcements.service.ts'), 'utf8')
    const start = src.indexOf('export async function getAnnouncementGate')
    const end = src.indexOf('export async function getPendingAnnouncementViews')
    const fn = src.slice(start, end)
    expect(fn).toContain('never pull body_html')
    expect(fn).not.toContain('bodyHtml: announcements.bodyHtml')
    expect(fn).not.toContain('db.select().from(announcements)')
  })

  it('shares one unread poll timer across layout and messages page', () => {
    const src = readFileSync(resolve('app/composables/useDirectMessages.ts'), 'utf8')
    expect(src).toContain('let sharedPollTimer')
    expect(src).toContain('sharedPollSubscribers')
    expect(src).toContain('pollInFlight')
    expect(src).not.toContain('let pollingStarted = false')
  })

  it('caps access-gate event fetches below the old 2000/5000 limits', () => {
    const api = readFileSync(resolve('server/api/admin/security/access-gate/events.get.ts'), 'utf8')
    const svc = readFileSync(resolve('server/services/access-gate.service.ts'), 'utf8')
    const ui = readFileSync(resolve('app/components/admin/ControlPanelAccessGate.vue'), 'utf8')
    expect(api).toContain('.max(1000)')
    expect(api).not.toContain('.max(5000)')
    expect(svc).toContain(', 1000)')
    expect(svc).not.toContain(', 5000)')
    expect(ui).toContain('limit: dayMode.value === \'all\' ? 1000 : 400')
    expect(ui).not.toContain('2000')
    expect(ui).not.toContain('5000')
  })

  it('checks file meta size before loading bytea for inline previews', () => {
    const preview = readFileSync(resolve('server/api/files/[id]/preview.get.ts'), 'utf8')
    const files = readFileSync(resolve('server/services/files.service.ts'), 'utf8')
    expect(preview).toContain('getFileMeta')
    expect(preview).toContain('assertInlinePreviewSize')
    expect(files).toContain('MAX_INLINE_PREVIEW_BYTES')
    expect(files).toContain('const originalMeta = await getFileMeta')
  })
})
