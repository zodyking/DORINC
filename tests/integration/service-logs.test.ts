// Integration tests for service logs schema/API (P1-15): create, status
// transitions per SPEC §6.4, mechanic own-scope filtering, updates.
import { config } from 'dotenv'
import { like, inArray, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createServiceLog,
  getServiceLog,
  listServiceLogs,
  transitionServiceLog,
  updateServiceLog,
} from '../../server/services/service-logs.service'
import { uploadFile } from '../../server/services/files.service'
import { createCustomer } from '../../server/services/customers.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { appFiles } from '../../server/db/schema/files'
import { customers } from '../../server/db/schema/customers'
import { vehicles } from '../../server/db/schema/vehicles'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const MECHANIC = anyUser!.id

const owner = await createCustomer(db, {
  displayName: `SlTest-${stamp} Fleet Co`,
  accountKind: 'fleet',
}, MECHANIC)

const unit = await createVehicle(db, {
  customerId: owner.id,
  unitType: 'truck',
  busNumber: `SL-${stamp}`,
  make: 'Kenworth',
  model: 'T680',
  year: 2018,
}, MECHANIC)

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

afterAll(async () => {
  await db.delete(appFiles).where(eq(appFiles.ownerEntityId, owner.id))
  await db.delete(serviceLogs).where(eq(serviceLogs.customerId, owner.id))
  await db.delete(vehicles).where(inArray(vehicles.customerId,
    db.select({ id: customers.id }).from(customers).where(like(customers.displayName, `SlTest-${stamp}%`))))
  await db.delete(customers).where(like(customers.displayName, `SlTest-${stamp}%`))
  await pool.end()
})

function makeLog(extra: Record<string, unknown> = {}) {
  return createServiceLog(db, {
    customerId: owner.id,
    vehicleId: unit.id,
    serviceDate: '2026-07-07',
    odometerReading: '412,806 mi',
    location: 'Shop bay 2',
    workType: 'preventive_maintenance',
    complaint: 'Rough idle at cold start',
    internalNotes: 'Replaced fuel filters',
    ...extra,
  }, MECHANIC)
}

describe('P1-15 service logs create + read', () => {
  it('creates a log with an assigned SL number and uploaded status', async () => {
    const log = await makeLog()
    expect(log.logNumber).toBeGreaterThan(1000)
    expect(log.status).toBe('uploaded')

    const read = await getServiceLog(db, log.id)
    expect(read.customerName).toContain('Fleet Co')
    expect(read.vehicle.busNumber).toBe(`SL-${stamp}`)
    expect(read.complaint).toBe('Rough idle at cold start')
  })

  it('assigns increasing log numbers', async () => {
    const a = await makeLog()
    const b = await makeLog()
    expect(b.logNumber).toBeGreaterThan(a.logNumber)
  })

  it('rejects a vehicle that belongs to a different customer', async () => {
    const other = await createCustomer(db, {
      displayName: `SlTest-${stamp} Other Co`,
      accountKind: 'fleet',
    }, MECHANIC)
    await expect(makeLog({ customerId: other.id }))
      .rejects.toThrow('VEHICLE_CUSTOMER_MISMATCH')
  })
})

describe('P1-15 status transitions (SPEC §6.4)', () => {
  it('walks the happy path to converted_to_invoice', async () => {
    const log = await makeLog()
    for (const to of ['ready_for_review', 'in_review', 'approved_for_invoice', 'converted_to_invoice'] as const) {
      const { log: next } = await transitionServiceLog(db, log.id, to)
      expect(next.status).toBe(to)
    }
  })

  it('supports needs_info loop back to review', async () => {
    const log = await makeLog()
    await transitionServiceLog(db, log.id, 'ready_for_review')
    await transitionServiceLog(db, log.id, 'in_review')
    const { log: flagged } = await transitionServiceLog(db, log.id, 'needs_info', { reason: 'Missing odometer photo' })
    expect(flagged.status).toBe('needs_info')
    expect(flagged.statusReason).toBe('Missing odometer photo')
    const { log: back } = await transitionServiceLog(db, log.id, 'ready_for_review')
    expect(back.status).toBe('ready_for_review')
  })

  it('supports OCR/AI processing states', async () => {
    const log = await makeLog()
    await transitionServiceLog(db, log.id, 'ocr_processing')
    await transitionServiceLog(db, log.id, 'ai_processing')
    const { log: ready } = await transitionServiceLog(db, log.id, 'ready_for_review')
    expect(ready.status).toBe('ready_for_review')
  })

  it('supports reject and archive; archive sets archivedAt', async () => {
    const log = await makeLog()
    await transitionServiceLog(db, log.id, 'ready_for_review')
    await transitionServiceLog(db, log.id, 'in_review')
    const { log: rejected } = await transitionServiceLog(db, log.id, 'rejected', { reason: 'Duplicate upload' })
    expect(rejected.status).toBe('rejected')
    const { log: archived } = await transitionServiceLog(db, log.id, 'archived')
    expect(archived.archivedAt).not.toBeNull()
    // restore path clears archivedAt
    const { log: restored } = await transitionServiceLog(db, log.id, 'ready_for_review')
    expect(restored.archivedAt).toBeNull()
  })

  it('rejects invalid transitions and mutations after conversion', async () => {
    const log = await makeLog()
    await expect(transitionServiceLog(db, log.id, 'converted_to_invoice'))
      .rejects.toThrow('INVALID_TRANSITION')

    await transitionServiceLog(db, log.id, 'ready_for_review')
    await transitionServiceLog(db, log.id, 'in_review')
    await transitionServiceLog(db, log.id, 'approved_for_invoice')
    await transitionServiceLog(db, log.id, 'converted_to_invoice')
    await expect(transitionServiceLog(db, log.id, 'ready_for_review'))
      .rejects.toThrow('INVALID_TRANSITION')
  })
})

describe('P1-15 updates + list scope', () => {
  it('updates fields and reports changedFields', async () => {
    const log = await makeLog()
    const { log: updated, changedFields } = await updateServiceLog(db, log.id, {
      complaint: 'Updated complaint',
      draftLineItems: [{ description: 'Fuel filter, primary', qty: '1', rate: '48.20', amount: '48.20' }],
    })
    expect(changedFields.sort()).toEqual(['complaint', 'draftLineItems'])
    expect(updated.complaint).toBe('Updated complaint')
    expect(Array.isArray(updated.draftLineItems)).toBe(true)
  })

  it('filters by status and by submitter (mechanic own scope)', async () => {
    const log = await makeLog()
    await transitionServiceLog(db, log.id, 'ready_for_review')

    const queue = await listServiceLogs(db, {
      customerId: owner.id,
      status: 'ready_for_review',
      page: 1,
      pageSize: 50,
    })
    expect(queue.items.some(i => i.id === log.id)).toBe(true)
    expect(queue.items.every(i => i.status === 'ready_for_review')).toBe(true)
    expect(queue.items[0]!.fileCount).toBe(0)

    const notMine = await listServiceLogs(db, {
      customerId: owner.id,
      submittedBy: '00000000-0000-0000-0000-000000000000',
      page: 1,
      pageSize: 50,
    })
    expect(notMine.items.length).toBe(0)
  })

  it('review queue filter returns pending statuses only', async () => {
    const pending = await makeLog()
    await transitionServiceLog(db, pending.id, 'ready_for_review')

    const done = await makeLog()
    await transitionServiceLog(db, done.id, 'ready_for_review')
    await transitionServiceLog(db, done.id, 'in_review')
    await transitionServiceLog(db, done.id, 'approved_for_invoice')

    const queue = await listServiceLogs(db, {
      queue: 'review',
      customerId: owner.id,
      page: 1,
      pageSize: 50,
    })
    expect(queue.items.some(i => i.id === pending.id)).toBe(true)
    expect(queue.items.some(i => i.id === done.id)).toBe(false)
    expect(queue.items.every(i => ['uploaded', 'ocr_processing', 'ai_processing', 'ready_for_review', 'in_review', 'needs_info'].includes(i.status))).toBe(true)
  })

  it('counts files linked to a service log without returning blobs', async () => {
    const log = await makeLog()
    await uploadFile(db, {
      ownerEntityType: 'service_log',
      ownerEntityId: log.id,
      fileKind: 'original',
      originalFilename: 'sheet.png',
      mimeType: 'image/png',
      data: PNG_BYTES,
    }, MECHANIC)

    const listed = await listServiceLogs(db, { customerId: owner.id, page: 1, pageSize: 50 })
    const row = listed.items.find(i => i.id === log.id)
    expect(row?.fileCount).toBe(1)
  })
})
