// Integration tests for vehicles CRUD/archive + bus-number uniqueness + VIN decode (P1-10, P1-11).
import { config } from 'dotenv'
import { like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  archiveVehicle,
  createVehicle,
  decodeVin,
  getVehicle,
  listVehicles,
  restoreVehicle,
  updateVehicle,
  VehiclesServiceError,
} from '../../server/services/vehicles.service'
import { createCustomer } from '../../server/services/customers.service'
import { customers } from '../../server/db/schema/customers'
import { vehicles } from '../../server/db/schema/vehicles'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const MISSING_ID = '00000000-0000-0000-0000-000000000000'

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const CREATOR = anyUser!.id

const owner = await createCustomer(db, {
  displayName: `VehTest-${stamp} Fleet Co`,
  accountKind: 'fleet',
}, CREATOR)

afterAll(async () => {
  await db.delete(vehicles).where(like(vehicles.unitTag, `VehTest-${stamp}%`))
  await db.delete(customers).where(like(customers.displayName, `VehTest-${stamp}%`))
  await pool.end()
})

function makeVehicle(extra: Record<string, unknown> = {}) {
  return createVehicle(db, {
    customerId: owner.id,
    unitTag: `VehTest-${stamp}`,
    unitType: 'truck',
    make: 'Freightliner',
    model: 'Cascadia',
    year: 2019,
    odometer: 412806,
    ...extra,
  }, CREATOR)
}

describe('P1-10 vehicles CRUD + bus number uniqueness', () => {
  it('creates and reads a vehicle', async () => {
    const v = await makeVehicle({ busNumber: `HL-${stamp}-1`, vin: '3akjhhdr9ksjv1234' })
    const read = await getVehicle(db, v.id)
    expect(read.make).toBe('Freightliner')
    expect(read.vin).toBe('3AKJHHDR9KSJV1234') // normalized uppercase
    expect(read.odometer).toBe('412806.0')
    expect(read.archivedAt).toBeNull()
  })

  it('rejects a duplicate bus number for the same customer', async () => {
    await makeVehicle({ busNumber: `HL-${stamp}-DUP` })
    await expect(makeVehicle({ busNumber: `HL-${stamp}-DUP` }))
      .rejects.toThrow('DUPLICATE_BUS_NUMBER')

    // …but another customer may reuse the number
    const other = await createCustomer(db, {
      displayName: `VehTest-${stamp} Other Co`,
      accountKind: 'fleet',
    }, CREATOR)
    const reused = await createVehicle(db, {
      customerId: other.id,
      unitTag: `VehTest-${stamp}`,
      busNumber: `HL-${stamp}-DUP`,
    }, CREATOR)
    expect(reused.busNumber).toBe(`HL-${stamp}-DUP`)
  })

  it('enforces uniqueness at the DB level too', async () => {
    await makeVehicle({ busNumber: `HL-${stamp}-DB` })
    // Bypass the service check with a raw insert — the partial unique index must reject it
    const err = await db.insert(vehicles).values({
      customerId: owner.id,
      unitTag: `VehTest-${stamp}`,
      busNumber: `HL-${stamp}-DB`,
    }).then(() => null, (e: Error) => e)
    expect(err).toBeTruthy()
    expect(String((err as Error & { cause?: Error }).cause ?? err)).toMatch(/duplicate key|vehicles_customer_bus_number_uq/)
  })

  it('updates fields, guards bus number collisions on update', async () => {
    const a = await makeVehicle({ busNumber: `HL-${stamp}-A` })
    const b = await makeVehicle({ busNumber: `HL-${stamp}-B` })

    const { vehicle, changedFields } = await updateVehicle(db, a.id, { odometer: 413000, color: 'White' })
    expect(changedFields.sort()).toEqual(['color', 'odometer'])
    expect(vehicle.odometer).toBe('413000.0')

    await expect(updateVehicle(db, b.id, { busNumber: `HL-${stamp}-A` }))
      .rejects.toThrow('DUPLICATE_BUS_NUMBER')
  })

  it('archives frees the bus number; restore re-checks it', async () => {
    const v = await makeVehicle({ busNumber: `HL-${stamp}-ARC` })
    await archiveVehicle(db, v.id)
    await expect(archiveVehicle(db, v.id)).rejects.toThrow('ALREADY_ARCHIVED')

    // Number freed for a new live unit
    const replacement = await makeVehicle({ busNumber: `HL-${stamp}-ARC` })
    expect(replacement.busNumber).toBe(`HL-${stamp}-ARC`)

    // Restoring the archived one would collide now
    await expect(restoreVehicle(db, v.id)).rejects.toThrow('DUPLICATE_BUS_NUMBER')
  })

  it('lists with filters and search', async () => {
    const v = await makeVehicle({ busNumber: `HL-${stamp}-LIST`, unitType: 'bus' })
    const byQ = await listVehicles(db, { q: `HL-${stamp}-LIST`, page: 1, pageSize: 10 })
    expect(byQ.items.map(i => i.id)).toContain(v.id)
    expect(byQ.items[0]!.customerName).toContain(`VehTest-${stamp}`)

    const byType = await listVehicles(db, { q: `HL-${stamp}-LIST`, unitType: 'truck', page: 1, pageSize: 10 })
    expect(byType.items).toHaveLength(0)
  })

  it('throws NOT_FOUND for missing ids', async () => {
    await expect(getVehicle(db, MISSING_ID)).rejects.toThrow(VehiclesServiceError)
  })
})

describe('P1-11 VIN decode (NHTSA vPIC)', () => {
  it('decodes a known VIN into normalized fields + raw payload', async () => {
    // 2019 Freightliner Cascadia sample VIN from vPIC docs ecosystem
    const { normalized, raw } = await decodeVin('3AKJHHDR9KSJV1234')
    expect(normalized.vin).toBe('3AKJHHDR9KSJV1234')
    expect(normalized.make).toMatch(/freightliner/i)
    expect(normalized.year).toBe(2019)
    expect(raw).toBeTypeOf('object')
    expect(Object.keys(raw).length).toBeGreaterThan(10)
  }, 30000)

  it('stores decode results on the vehicle row', async () => {
    const { normalized, raw } = await decodeVin('3AKJHHDR9KSJV1234')
    const v = await makeVehicle({
      busNumber: `HL-${stamp}-VIN`,
      vin: normalized.vin,
      year: normalized.year,
      make: normalized.make,
      model: normalized.model,
      vinDecodeRaw: raw,
    })
    const read = await getVehicle(db, v.id)
    expect(read.vinDecodeRaw).toBeTruthy()
    expect((read.vinDecodeRaw as Record<string, string>).Make).toMatch(/freightliner/i)
  }, 30000)
})
