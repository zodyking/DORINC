import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression wiring for the login → My Account redirect loop that could storm
 * the server until the app stopped loading for everyone.
 */
describe('login gate redirect loop protection', () => {
  const middleware = readFileSync(resolve('app/middleware/access.global.ts'), 'utf8')
  const guard = readFileSync(resolve('app/utils/staff-route-guard.ts'), 'utf8')
  const requiredPage = readFileSync(resolve('app/pages/announcements/required.vue'), 'utf8')
  const meEndpoint = readFileSync(resolve('server/api/auth/me.get.ts'), 'utf8')
  const service = readFileSync(resolve('server/services/announcements.service.ts'), 'utf8')
  const authService = readFileSync(resolve('server/auth/auth.service.ts'), 'utf8')

  it('breaker starts a gate cooldown instead of only clearing local state', () => {
    expect(middleware).toContain('startGateCooldown()')
  })

  it('guard suppresses gate redirects while the cooldown is active', () => {
    expect(guard).toContain('isGateCooldownActive()')
  })

  it('gate page cooldowns a stale lock so the /me poll cannot re-yank navigation', () => {
    expect(requiredPage).toContain('startGateCooldown()')
  })

  it('/api/auth/me uses the cached announcement gate', () => {
    expect(meEndpoint).toContain('getAnnouncementGateCached')
    expect(meEndpoint).not.toMatch(/\bgetAnnouncementGate\(/)
  })

  it('acknowledge is idempotent for announcements that are no longer pending', () => {
    const ackStart = service.indexOf('export async function acknowledgeAnnouncement')
    const ackEnd = service.indexOf('export', ackStart + 10)
    const ack = service.slice(ackStart, ackEnd)
    expect(ack).not.toContain('NOT_FOUND')
    expect(ack).toContain('invalidateAnnouncementGateCache')
  })

  it('gate cache invalidates on ack reset at login and on announcement changes', () => {
    expect(authService).toContain('invalidateAnnouncementGateCache(user.id)')
    const createBody = service.slice(service.indexOf('export async function createAnnouncement'))
    expect(createBody).toContain('invalidateAnnouncementGateCache()')
  })
})
