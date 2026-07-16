// Integration tests for backup recovery, step-up, and suspicious activity (P3-08/09/10).
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { login, signup, verifyEmail } from '../../server/auth/auth.service'
import { hashToken } from '../../server/auth/tokens'
import { sessions, users } from '../../server/db/schema/auth'
import { backupRuns } from '../../server/db/schema/backups'
import { backupRecoveryTests, suspiciousActivityAlerts } from '../../server/db/schema/security'
import {
  listRecoveryTests,
  runManualBackup,
  runRecoveryTest,
} from '../../server/services/backups.service'
import {
  createSuspiciousActivityAlert,
  dismissSuspiciousActivityAlert,
  listSuspiciousActivityAlerts,
  recordBackupRestoreAlert,
  scanSuspiciousActivity,
} from '../../server/services/suspicious-activity.service'
import {
  getStepUpStatus,
  isStepUpValid,
  verifyStepUp,
} from '../../server/services/step-up.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const testEmail = `recovery-test-${stamp}@test.dorinc.local`
const testPassword = 'recovery-test-password-123'
let pgDumpAvailable = false
let testUserId: string | null = null
let testSessionId: string | null = null

const encryptionKey = process.env.ENCRYPTION_MASTER_KEY ?? `test-backup-key-${stamp}`

beforeAll(async () => {
  process.env.ENCRYPTION_MASTER_KEY = encryptionKey
  pgDumpAvailable = await commandExists('pg_dump')

  const { user, verificationToken } = await signup(db, {
    name: 'Recovery Test User',
    email: testEmail,
    password: testPassword,
    requestedAccountType: 'accountant',
  })
  await verifyEmail(db, verificationToken)
  await db.update(users).set({ approvedAt: new Date() }).where(eq(users.id, user.id))
  testUserId = user.id

  const session = await login(db, testEmail, testPassword)
  const [sessionRow] = await db.select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(session.sessionToken)))
    .limit(1)
  testSessionId = sessionRow?.id ?? null
})

afterAll(async () => {
  await db.delete(suspiciousActivityAlerts)
  await db.delete(backupRecoveryTests)
  await db.delete(backupRuns)
  await db.delete(users).where(like(users.email, `recovery-test-${stamp}@%`))
  await pool.end()
})

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

describe('P3-08 step-up verification', () => {
  it('verifies password and tracks session step-up status', async () => {
    if (!testUserId || !testSessionId) return

    const before = await getStepUpStatus(db, testSessionId)
    expect(before.verified).toBe(false)

    const verifiedAt = await verifyStepUp(db, testUserId, testSessionId, testPassword)
    expect(isStepUpValid(verifiedAt)).toBe(true)

    const after = await getStepUpStatus(db, testSessionId)
    expect(after.verified).toBe(true)
    expect(after.expiresAt).not.toBeNull()
  })

  it('rejects incorrect step-up password', async () => {
    if (!testUserId || !testSessionId) return

    await expect(
      verifyStepUp(db, testUserId, testSessionId, 'wrong-password-value'),
    ).rejects.toThrow('INVALID_PASSWORD')
  })
})

describe('P3-09 recovery test workflow', () => {
  it('runs recovery test against completed backup without production restore', async () => {
    if (!pgDumpAvailable || !process.env.DATABASE_URL || !testUserId) return

    const run = await runManualBackup(db, {
      id: testUserId,
      email: testEmail,
      accountType: 'accountant',
    })

    expect(run.status).toBe('completed')

    const test = await runRecoveryTest(db, run.id, {
      id: testUserId,
      email: testEmail,
      accountType: 'accountant',
    })

    expect(test.status).toBe('passed')
    expect(test.valid).toBe(true)
    expect(test.tocEntries).toBeGreaterThan(0)

    const listed = await listRecoveryTests(db, 5)
    expect(listed.some(item => item.id === test.id)).toBe(true)
  })
})

describe('P3-10 suspicious activity detection', () => {
  it('creates, lists, and dismisses alerts', async () => {
    if (!testUserId) return

    const alert = await createSuspiciousActivityAlert(db, {
      ruleKey: 'auth.failed_login_burst',
      severity: 'high',
      title: 'Test alert',
      description: 'Integration test alert',
      metadata: { dedupeKey: `test-${stamp}` },
      actorUserId: testUserId,
      actorEmail: testEmail,
      ipAddress: '203.0.113.10',
      ipAddresses: ['203.0.113.10', '203.0.113.11'],
    })

    expect(alert.status).toBe('open')
    expect(alert.actorEmail).toBe(testEmail)
    expect(alert.ipAddresses).toEqual(['203.0.113.10', '203.0.113.11'])

    const open = await listSuspiciousActivityAlerts(db, { status: 'open' })
    expect(open.some(item => item.id === alert.id)).toBe(true)

    const dismissed = await dismissSuspiciousActivityAlert(db, alert.id, testUserId)
    expect(dismissed?.status).toBe('dismissed')
  })

  it('records backup restore alerts and scans without error', async () => {
    if (!testUserId) return

    const alert = await recordBackupRestoreAlert(
      db,
      { id: testUserId, email: testEmail, name: 'Test Admin' },
      '00000000-0000-0000-0000-000000000001',
      'Disaster recovery drill',
      '198.51.100.42',
    )

    expect(alert.ruleKey).toBe('backup.restore_attempt')
    expect(alert.ipAddress).toBe('198.51.100.42')
    expect(alert.ipAddresses).toEqual(['198.51.100.42'])

    const scanned = await scanSuspiciousActivity(db)
    expect(scanned).toBeTypeOf('number')
  })
})

describe('P3-08 step-up TTL helpers', () => {
  it('expires step-up after TTL window', () => {
    const verifiedAt = new Date(Date.now() - 11 * 60 * 1000)
    expect(isStepUpValid(verifiedAt)).toBe(false)
  })
})
