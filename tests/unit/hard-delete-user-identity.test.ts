import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('hard-delete user identity wipe', () => {
  const source = readFileSync(resolve('server/services/hard-delete.service.ts'), 'utf8')
  const hardDeleteUserFn = source.slice(source.indexOf('export async function hardDeleteUser'))
  const serviceLogs = readFileSync(resolve('server/services/service-logs.service.ts'), 'utf8')
  const messages = readFileSync(resolve('server/services/messages.service.ts'), 'utf8')
  const portal = readFileSync(resolve('server/services/portal-request-review.service.ts'), 'utf8')
  const schemaLogs = readFileSync(resolve('server/db/schema/service-logs.ts'), 'utf8')

  it('keeps invoices, messages, service logs, and portal requests', () => {
    expect(hardDeleteUserFn).not.toMatch(/db\.delete\(messages\)\.where\(eq\(messages\.senderUserId/)
    expect(hardDeleteUserFn).not.toMatch(/db\.delete\(serviceLogs\)/)
    expect(hardDeleteUserFn).not.toMatch(/db\.delete\(newVehicleRequests\)/)
    expect(hardDeleteUserFn).not.toMatch(/db\.delete\(serviceRequests\)/)
    expect(hardDeleteUserFn).not.toContain('service log(s)')
    expect(source).toContain('senderUserId: null')
    expect(source).toContain('submittedBy: null')
    expect(source).toContain('Business records stay')
  })

  it('wipes sessions, saved devices, and access-gate presence', () => {
    expect(source).toContain('wipeUserIdentityPresence')
    expect(source).toContain('exclusiveDeviceIds')
    expect(source).toContain('accessEvents')
    expect(source).toContain('outsideGeoChallenges')
    expect(source).toContain('serviceLogUploadSessions')
    expect(hardDeleteUserFn).toContain('db.delete(sessions)')
    expect(hardDeleteUserFn).toContain('db.delete(users)')
  })

  it('does not treat submitted service logs as a deletion blocker', () => {
    expect(hardDeleteUserFn).not.toContain('HAS_DEPENDENTS')
    expect(schemaLogs).toContain("onDelete: 'set null'")
    expect(schemaLogs).not.toMatch(/submittedBy: uuid\('submitted_by'\)\.notNull\(\)/)
  })

  it('still lists logs and chat after the submitter/sender is gone', () => {
    expect(serviceLogs).toContain('.leftJoin(users, eq(serviceLogs.submittedBy, users.id))')
    expect(serviceLogs).not.toContain('.innerJoin(users, eq(serviceLogs.submittedBy, users.id))')
    expect(messages).toContain('.leftJoin(users, eq(messages.senderUserId, users.id))')
    expect(portal).toContain('.leftJoin(users, eq(serviceRequests.submittedBy, users.id))')
    expect(portal).toContain('.leftJoin(users, eq(newVehicleRequests.submittedBy, users.id))')
  })

  it('does not erase a shared phone used by another living user', () => {
    expect(source).toContain('Shared phones keep the other person')
    expect(source).toContain('ne(sessions.userId, userId)')
    expect(source).toContain('ne(accessEvents.userId, userId)')
  })
})
