import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { appSettings } from '../../server/db/schema/settings'
import { getPdfWorkerHealth } from '../../server/services/worker-health.service'

config()

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null
const db = pool ? drizzle({ client: pool }) : null

afterAll(async () => {
  await pool?.end()
})

describe('worker-health pdf heartbeat', () => {
  it('reports idle when pdf-worker heartbeat is fresh', async () => {
    if (!db) return

    const key = 'worker.pdf.heartbeat'
    const at = new Date().toISOString()
    await db.delete(appSettings).where(eq(appSettings.key, key))
    await db.insert(appSettings).values({ key, value: { at } })

    const health = await getPdfWorkerHealth(db)
    expect(health.status).toBe('idle')
    expect(health.message).toContain('DomPDF')
    expect(health.message).toContain('awaiting first job')
  })
})
