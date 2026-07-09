// Integration tests for staff dashboard API (P1-37).
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { getDashboard } from '../../server/services/dashboard.service'
import { ACCOUNT_TYPE_BUNDLES } from '../../shared/permissions/keys'
import type { PermissionKey } from '../../shared/permissions/keys'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

afterAll(async () => {
  await pool.end()
})

describe('P1-37 dashboard service', () => {
  it('returns billing view for accountant permissions', async () => {
    const perms = ACCOUNT_TYPE_BUNDLES.accountant as PermissionKey[]
    const dash = await getDashboard(db, {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Alicia M.',
      accountType: 'accountant',
    }, perms)

    expect(dash.view).toBe('billing')
    expect(dash.greeting).toMatch(/Good (morning|afternoon|evening), Alicia/)
    expect(dash.billing).toBeDefined()
    expect(dash.billing?.kpis).toMatchObject({
      outstandingTotal: expect.any(String),
      paidThisMonthTotal: expect.any(String),
    })
    expect(dash.primaryCta.href).toBe('/invoices/new')
    expect(dash.billing?.reviewQueue).toMatchObject({
      serviceLogs: expect.any(Number),
      portalRequests: expect.any(Number),
      deletionRequests: expect.any(Number),
      aiExtractions: 0,
    })
  })

  it('returns mechanic view without invoice read permission', async () => {
    const perms = ACCOUNT_TYPE_BUNDLES.mechanic as PermissionKey[]
    const dash = await getDashboard(db, {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Jordan T.',
      accountType: 'mechanic',
    }, perms)

    expect(dash.view).toBe('mechanic')
    expect(dash.mechanic).toBeDefined()
    expect(dash.primaryCta.label).toContain('Service Log')
    expect(dash.billing).toBeUndefined()
  })

  it('returns auditor view for external auditor account type', async () => {
    const perms = ACCOUNT_TYPE_BUNDLES.external_auditor as PermissionKey[]
    const dash = await getDashboard(db, {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Pat R.',
      accountType: 'external_auditor',
    }, perms)

    expect(dash.view).toBe('auditor')
    expect(dash.auditor).toBeDefined()
    expect(dash.auditor?.kpis.invoiceCount).toBeGreaterThanOrEqual(0)
    expect(dash.primaryCta.href).toBe('/invoices')
    expect(dash.billing).toBeUndefined()
  })
})
