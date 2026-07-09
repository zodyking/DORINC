// Integration tests for Super Admin system status (P1-34, P2-21).
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { getSystemStatus } from '../../server/services/system-admin.service'
import { getPdfWorkerHealth, getWorkerQueueHealth } from '../../server/services/worker-health.service'
import { ACCOUNT_TYPE_BUNDLES } from '../../shared/permissions/keys'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

afterAll(async () => {
  await pool.end()
})

describe('P1-34 Super Admin system status', () => {
  it('only super_admin carries system.admin.all', () => {
    const withAdmin = Object.entries(ACCOUNT_TYPE_BUNDLES)
      .filter(([, bundle]) => bundle.includes('system.admin.all'))
      .map(([type]) => type)
    expect(withAdmin).toEqual(['super_admin'])
  })

  it('returns database, version, smtp, backup, AI, PDF worker, and worker queue health', async () => {
    const status = await getSystemStatus(db)
    expect(status.database).toBe('ok')
    expect(status.dbLatencyMs).toBeTypeOf('number')
    expect(status.version).toMatch(/\d+\.\d+\.\d+/)
    expect(status.smtp).toMatchObject({ port: expect.any(Number) })
    expect(['not_configured', 'healthy', 'error']).toContain(status.backup.status)
    expect(status.backup.message).toBeTypeOf('string')
    expect(status.backup.scheduleEnabled).toBeTypeOf('boolean')
    expect(status.backup.scheduleLabel).toBeTypeOf('string')
    expect(status.backup.driveConnected).toBeTypeOf('boolean')
    expect(['not_configured', 'disabled', 'active', 'error']).toContain(status.ai.status)
    expect(status.ai.monthlyCostUsd).toBeTypeOf('number')
    expect(['running', 'idle', 'backlog', 'error', 'unknown']).toContain(status.pdfWorker.status)
    expect(status.pdfWorker.message).toContain('Playwright Chromium')
    expect(status.pdfWorker.queued).toBeTypeOf('number')
    expect(status.pdfWorker.processing).toBeTypeOf('number')
    expect(status.pdfWorker.failed).toBeTypeOf('number')
    expect(['healthy', 'idle', 'backlog', 'error']).toContain(status.workerQueue.status)
    expect(status.workerQueue.queued).toBeTypeOf('number')
    expect(status.workerQueue.byType).toBeTypeOf('object')
  })

  it('reports PDF worker and worker queue health independently', async () => {
    const [pdfWorker, workerQueue] = await Promise.all([
      getPdfWorkerHealth(db),
      getWorkerQueueHealth(db),
    ])
    expect(pdfWorker.message).toMatch(/failed/)
    expect(workerQueue.message).toMatch(/queued|idle|failed/)
  })
})
