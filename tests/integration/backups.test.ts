// Integration tests for encrypted manual backups (P1-36).
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { backupRuns } from '../../server/db/schema/backups'
import { users } from '../../server/db/schema/auth'
import {
  decryptBackupRun,
  runManualBackup,
  verifyBackupRun,
} from '../../server/services/backups.service'
import { sha256Hex } from '../../server/services/encryption.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
let pgDumpAvailable = false
const encryptionKey = process.env.ENCRYPTION_MASTER_KEY ?? `test-backup-key-${stamp}`

beforeAll(async () => {
  process.env.ENCRYPTION_MASTER_KEY = encryptionKey
  pgDumpAvailable = await commandExists('pg_dump')
})

afterAll(async () => {
  await db.delete(backupRuns).where(eq(backupRuns.trigger, 'manual'))
  await pool.end()
})

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

describe('P1-36 encrypted manual backup', () => {
  it('runs pg_dump → zstd → encrypt with checksum + audit', async () => {
    if (!pgDumpAvailable) {
      console.warn('Skipping backup test — pg_dump not available')
      return
    }
    if (!process.env.DATABASE_URL) {
      console.warn('Skipping backup test — DATABASE_URL not set')
      return
    }

    const [actor] = await db.select({ id: users.id, name: users.name, email: users.email, accountType: users.accountType }).from(users).limit(1)
    expect(actor).toBeTruthy()

    const run = await runManualBackup(db, {
      id: actor!.id,
      name: actor!.name ?? undefined,
      email: actor!.email ?? undefined,
      accountType: actor!.accountType ?? undefined,
    })

    expect(run.status).toBe('completed')
    expect(run.filename).toMatch(/^backup_devon_invoice_suite_\d{8}_\d{6}\.dump\.zst\.enc$/)
    expect(run.encryptedBytes).toBeGreaterThan(0)
    expect(run.sha256Checksum).toMatch(/^[a-f0-9]{64}$/)

    const [stored] = await db.select({
      encryptedPayload: backupRuns.encryptedPayload,
      sha256Checksum: backupRuns.sha256Checksum,
    }).from(backupRuns).where(eq(backupRuns.id, run.id))

    expect(stored?.sha256Checksum).toBe(sha256Hex(stored!.encryptedPayload))

    const [audit] = await db.select().from(auditLogs)
      .where(eq(auditLogs.entityId, run.id))
      .limit(1)
    expect(audit?.action).toBe('backup.completed')
    expect(audit?.entityType).toBe('backup')
  })

  it('decrypts and verifies backup archive with pg_restore --list', async () => {
    if (!pgDumpAvailable || !process.env.DATABASE_URL) return

    const [latest] = await db.select({ id: backupRuns.id })
      .from(backupRuns)
      .where(eq(backupRuns.status, 'completed'))
      .limit(1)

    if (!latest) {
      console.warn('Skipping verify test — no completed backup run')
      return
    }

    const dump = await decryptBackupRun(db, latest.id)
    expect(dump.length).toBeGreaterThan(0)
    expect(dump.subarray(0, 5).toString()).toBe('PGDMP')

    const verify = await verifyBackupRun(db, latest.id)
    expect(verify.valid).toBe(true)
    expect(verify.tocEntries).toBeGreaterThan(0)
  })
})
