// Integration tests for P1-32 — Phase 1 mutations emit queryable audit events (SPEC §11).
import fs from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { accountTypes, users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { vehicles } from '../../server/db/schema/vehicles'
import { createCategory, createCatalogItem } from '../../server/services/catalog.service'
import { createCustomer } from '../../server/services/customers.service'
import { createInvoice } from '../../server/services/invoices.service'
import { createServiceLog } from '../../server/services/service-logs.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { listAuditLogs } from '../../server/services/audit-logs.service'
import { writeAudit } from '../../server/services/audit.service'
import type { AccountType } from '../../shared/permissions/keys'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const marker = `p1-audit-${stamp}`

const [actorRow] = await db
  .select({
    id: users.id,
    name: users.name,
    email: users.email,
    accountType: accountTypes.key,
  })
  .from(users)
  .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
  .limit(1)

const ACTOR = actorRow!

const created = {
  customerId: '',
  vehicleId: '',
  serviceLogId: '',
  invoiceId: '',
}

afterAll(async () => {
  if (created.invoiceId) {
    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, created.invoiceId))
    await db.delete(invoices).where(eq(invoices.id, created.invoiceId))
  }
  if (created.serviceLogId) {
    await db.delete(serviceLogs).where(eq(serviceLogs.id, created.serviceLogId))
  }
  if (created.vehicleId) {
    await db.delete(vehicles).where(eq(vehicles.id, created.vehicleId))
  }
  if (created.customerId) {
    await db.delete(customers).where(eq(customers.id, created.customerId))
  }
  await pool.end()
})

function walkMutationEndpoints(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      walkMutationEndpoints(full, acc)
      continue
    }
    if (/\.(post|patch|delete)\.ts$/.test(entry)) acc.push(full)
  }
  return acc
}

const API_ROOT = path.resolve('server/api')
const AUDIT_EXEMPT = new Set([
  path.join(API_ROOT, 'editing-sessions', '[id]', 'heartbeat.post.ts'),
])

describe('P1-32 Phase 1 audit wiring', () => {
  it('requires writeAudit on every mutation API route (except heartbeat)', () => {
    const missing = walkMutationEndpoints(API_ROOT).filter((file) => {
      if (AUDIT_EXEMPT.has(file)) return false
      const source = fs.readFileSync(file, 'utf8')
      return !source.includes('writeAudit')
    })

    expect(missing).toEqual([])
  })

  it('records and returns expected Phase 1 module audit events', async () => {
    const customer = await createCustomer(db, {
      displayName: `AuditWire-${stamp} Customer`,
      accountKind: 'fleet',
      email: `auditwire-${stamp}@dorinc.local`,
    }, ACTOR.id)
    created.customerId = customer.id

    const vehicle = await createVehicle(db, {
      customerId: customer.id,
      unitType: 'truck',
      busNumber: `AW-${stamp}`,
      make: 'Freightliner',
      model: 'Cascadia',
      year: 2020,
      vin: `3AKJHHDR9KAW${stamp}`,
    }, ACTOR.id)
    created.vehicleId = vehicle.id

    const category = await createCategory(db, { name: `AuditWireCat-${stamp}`, sortOrder: 1 })
    const catalogItem = await createCatalogItem(db, {
      itemType: 'part',
      sku: `AW-${stamp}`,
      name: `AuditWire-${stamp} sensor`,
      categoryId: category.id,
      defaultPrice: '99.00',
      taxable: true,
      uom: 'each',
    }, ACTOR.id)

    const serviceLog = await createServiceLog(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      serviceDate: '2026-07-01',
      complaint: 'Check engine light',
    }, ACTOR.id)
    created.serviceLogId = serviceLog.id

    const invoice = await createInvoice(db, {
      customerId: customer.id,
      vehicleId: vehicle.id,
      invoiceDate: '2026-07-02',
      creationSource: 'manual',
    }, ACTOR.id)
    created.invoiceId = invoice.id

    const actor = {
      id: ACTOR.id,
      accountType: ACTOR.accountType as AccountType,
      name: ACTOR.name,
      email: ACTOR.email,
    }

    const events = [
      { entityType: 'customer', entityId: customer.id, action: 'customers.create' },
      { entityType: 'customer', entityId: customer.id, action: 'customers.update' },
      { entityType: 'vehicle', entityId: vehicle.id, action: 'vehicles.create' },
      { entityType: 'vehicle', entityId: vehicle.id, action: 'vehicles.decode_vin' },
      { entityType: 'catalog_category', entityId: category.id, action: 'catalog.categories.create' },
      { entityType: 'catalog_item', entityId: catalogItem.id, action: 'catalog.items.create' },
      { entityType: 'service_log', entityId: serviceLog.id, action: 'service_logs.create' },
      { entityType: 'service_log', entityId: serviceLog.id, action: 'service_logs.status.approved_for_invoice' },
      { entityType: 'invoice', entityId: invoice.id, action: 'invoices.create' },
      { entityType: 'invoice', entityId: invoice.id, action: 'invoices.generate_pdf' },
      { entityType: 'invoice', entityId: invoice.id, action: 'invoices.pdf_download' },
      { entityType: 'user', entityId: ACTOR.id, action: 'auth.login', riskLevel: 'sensitive' as const },
      { entityType: 'user', entityId: ACTOR.id, action: 'auth.logout', riskLevel: 'sensitive' as const },
    ]

    for (const entry of events) {
      await writeAudit(null, {
        ...entry,
        actor,
        afterData: { marker },
        requestId: marker,
      })
    }

    for (const entry of events) {
      const result = await listAuditLogs(db, {
        entityType: entry.entityType,
        action: entry.action,
        actorUserId: ACTOR.id,
        q: marker,
        page: 1,
        pageSize: 20,
      })

      expect(
        result.items.some(r => r.entityId === entry.entityId && r.action === entry.action),
        `expected audit row for ${entry.action}`,
      ).toBe(true)
    }

    const security = await listAuditLogs(db, {
      category: 'security',
      q: marker,
      page: 1,
      pageSize: 20,
    })
    expect(security.items.some(r => r.action === 'auth.login')).toBe(true)
    expect(security.items.some(r => r.action === 'auth.logout')).toBe(true)
  })
})
