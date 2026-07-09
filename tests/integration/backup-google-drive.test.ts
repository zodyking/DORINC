// Integration tests for Google Drive backup integration (P2-17).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { backupIntegrations } from '../../server/db/schema/backups'
import {
  getBackupIntegrationView,
  GoogleDriveBackupError,
} from '../../server/services/google-drive-backup.service'
import { getBackupHealth } from '../../server/services/backups.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

beforeAll(async () => {
  process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? 'test-backup-drive-key-64-hex-chars-0123456789abcdef0123'
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session-secret-64-hex-chars-0123456789abcdef0123'
})

afterAll(async () => {
  await db.delete(backupIntegrations).where(eq(backupIntegrations.provider, 'google_drive'))
  await pool.end()
})

describe('P2-17 Google Drive backup integration', () => {
  it('returns disconnected integration view by default', async () => {
    const view = await getBackupIntegrationView(db)
    expect(view.provider).toBe('google_drive')
    expect(view.connected).toBe(false)
    expect(view.accountEmail).toBeNull()
  })

  it('reports drive status in backup health', async () => {
    const health = await getBackupHealth(db)
    expect(health.driveConnected).toBe(false)
    expect(health.scheduleLabel).toMatch(/Nightly|Scheduled/)
    expect(health.scheduleEnabled).toBeTypeOf('boolean')
  })

  it('fails test connection when Google OAuth is not configured', async () => {
    const prevId = process.env.GOOGLE_CLIENT_ID
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET

    const { testGoogleDriveConnection } = await import('../../server/services/google-drive-backup.service')
    await expect(testGoogleDriveConnection(db)).rejects.toBeInstanceOf(GoogleDriveBackupError)

    process.env.GOOGLE_CLIENT_ID = prevId
    process.env.GOOGLE_CLIENT_SECRET = prevSecret
  })
})
