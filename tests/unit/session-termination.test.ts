import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SESSION_TERMINATED_REDIRECT_SECONDS,
  isSessionTerminationActive,
} from '../../shared/session-termination'

describe('session termination', () => {
  it('treats recent records as active and old ones as expired', () => {
    const now = Date.parse('2026-08-12T17:00:00.000Z')
    expect(isSessionTerminationActive({
      at: '2026-08-12T16:55:00.000Z',
      byUserId: 'u1',
      byName: 'Admin',
      byEmail: 'a@example.com',
      revokedCount: 3,
    }, now)).toBe(true)

    expect(isSessionTerminationActive({
      at: '2026-08-12T15:00:00.000Z',
      byUserId: 'u1',
      byName: 'Admin',
      byEmail: 'a@example.com',
      revokedCount: 3,
    }, now)).toBe(false)

    expect(isSessionTerminationActive(null, now)).toBe(false)
  })

  it('uses a 15 second terminated-page countdown', () => {
    expect(SESSION_TERMINATED_REDIRECT_SECONDS).toBe(15)
  })

  it('ships admin terminate control and notice page', () => {
    const panel = readFileSync(
      resolve('app/components/admin/ControlPanelTerminateSessions.vue'),
      'utf8',
    )
    const page = readFileSync(
      resolve('app/pages/auth/session-terminated.vue'),
      'utf8',
    )
    const api = readFileSync(
      resolve('server/api/admin/security/terminate-all-sessions.post.ts'),
      'utf8',
    )
    expect(panel).toContain('Terminate All Sessions')
    expect(page).toContain('Has Been Terminated')
    expect(page).toContain('SESSION_TERMINATED_REDIRECT_SECONDS')
    expect(api).toContain('revokeAllActiveSessions')
  })
})
