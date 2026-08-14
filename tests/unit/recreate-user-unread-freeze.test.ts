import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('recreated staff unread must not scan history', () => {
  const teamChat = readFileSync(resolve('server/services/team-chat.service.ts'), 'utf8')
  const worker = readFileSync(resolve('server/workers/lib/team-chat.mjs'), 'utf8')
  const dm = readFileSync(resolve('app/composables/useDirectMessages.ts'), 'utf8')
  const layout = readFileSync(resolve('app/layouts/staff.vue'), 'utf8')

  it('marks new team-chat members as caught up at join time', () => {
    expect(teamChat).toContain('lastReadAt: new Date()')
    expect(worker).toContain('last_read_at')
    expect(worker).toContain('VALUES ($1, $2, now())')
  })

  it('does not poll messages while a login gate owns the screen', () => {
    expect(dm).toContain('mustChangePassword !== true')
    expect(dm).toContain('!auth.announcementGate?.locked')
    expect(layout).toContain('!passwordLocked.value')
    expect(layout).toContain('!announcementLocked.value')
  })
})

describe('recreated staff login must not mount workspace chrome or ping-pong gates', () => {
  it('keeps the password gate off the staff layout', () => {
    const page = readFileSync(resolve('app/pages/account/password-required.vue'), 'utf8')
    expect(page).toContain('layout: false')
    expect(page).not.toContain("layout: 'staff'")
  })

  it('does not locally clear announcement or password locks during a redirect storm', () => {
    const mw = readFileSync(resolve('app/middleware/access.global.ts'), 'utf8')
    expect(mw).toContain('resolveGateStormFallback')
    expect(mw).not.toContain('mustChangePassword: false')
    expect(mw).not.toContain('locked: false, pendingCount: 0')
  })

  it('hydrates the next required-message body after acknowledge instead of preloading every HTML blob', () => {
    const page = readFileSync(resolve('app/pages/announcements/required.vue'), 'utf8')
    expect(page).toContain('hydrateCurrentBody')
    expect(page).toContain('advanceAnnouncementQueue')
  })

  it('does not sync team-chat participants twice when listing conversations', () => {
    const src = readFileSync(resolve('server/services/messages.service.ts'), 'utf8')
    const start = src.indexOf('export async function listConversations')
    const end = src.indexOf('export async function getConversationDeletionLabel')
    const fn = src.slice(start, end)
    expect(fn).toContain('getTeamConversationSummary')
    expect(fn).not.toContain('syncTeamChatParticipants')
  })
})
