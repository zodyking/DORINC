// Integration tests for backup retention pruning (P3-11).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { backupRuns, backupSettings } from '../../server/db/schema/backups'
import { pruneExpiredBackups } from '../../server/services/backup-retention.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
let settingsId: string

beforeAll(async () => {
  const [settings] = await db.select().from(backupSettings).limit(1)
  settingsId = settings?.id ?? (await db.insert(backupSettings).values({
    retentionDaily: 30,
    retentionWeekly: 12,
    retentionMonthly: 12,
  }).returning())[0]!.id
})

afterAll(async () => {
  await db.delete(backupRuns).where(eq(backupRuns.filename, `retention-test-old-${stamp}.enc`))
  await db.delete(backupRuns).where(eq(backupRuns.filename, `retention-test-new-${stamp}.enc`))
  await db.update(backupSettings).set({
    retentionDaily: 30,
    retentionWeekly: 12,
    retentionMonthly: 12,
  }).where(eq(backupSettings.id, settingsId))
  await pool.end()
})

describe('P3-11 backup retention pruning', () => {
  it('deletes completed backups outside retention policy', async () => {
    await db.update(backupSettings).set({
      retentionDaily: 7,
      retentionWeekly: 2,
      retentionMonthly: 2,
    }).where(eq(backupSettings.id, settingsId))

    const oldDate = new Date()
    oldDate.setUTCDate(oldDate.getUTCDate() - 400)

    const [oldRun] = await db.insert(backupRuns).values({
      filename: `retention-test-old-${stamp}.enc`,
      status: 'completed',
      trigger: 'manual',
      encryptedBytes: 128,
      sha256Checksum: 'a'.repeat(64),
      encryptedPayload: Buffer.from('old'),
      createdAt: oldDate,
      finishedAt: oldDate,
    }).returning()

    const [newRun] = await db.insert(backupRuns).values({
      filename: `retention-test-new-${stamp}.enc`,
      status: 'completed',
      trigger: 'manual',
      encryptedBytes: 128,
      sha256Checksum: 'b'.repeat(64),
      encryptedPayload: Buffer.from('new'),
      finishedAt: new Date(),
    }).returning()

    const result = await pruneExpiredBackups(db, null)
    expect(result.pruned).toBeGreaterThanOrEqual(1)

    const [oldStored] = await db.select({ id: backupRuns.id }).from(backupRuns)
      .where(eq(backupRuns.id, oldRun!.id))
    const [newStored] = await db.select({ id: backupRuns.id }).from(backupRuns)
      .where(eq(backupRuns.id, newRun!.id))

    expect(oldStored).toBeUndefined()
    expect(newStored).toBeDefined()
  })
})
