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
