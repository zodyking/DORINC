// Integration tests for portal vehicles list + new vehicle request (P2-06).
import { config } from 'dotenv'
import { eq, inArray, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import { newVehicleRequests } from '../../server/db/schema/portal-requests'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { vehicles } from '../../server/db/schema/vehicles'
import { createCustomer } from '../../server/services/customers.service'
import {
  createNewVehicleRequest,
  createPortalUser,
  listPortalVehicles,
} from '../../server/services/portal.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { createServiceLog } from '../../server/services/service-logs.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const customerA = await createCustomer(db, {
  displayName: `PortalVehA-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const customerB = await createCustomer(db, {
  displayName: `PortalVehB-${stamp}`,
  accountKind: 'fleet',
  paymentTerms: 'net_30',
}, ACTOR)

const vehicleA = await createVehicle(db, {
  customerId: customerA.id,
  unitType: 'tractor',
  busNumber: `PV-${stamp}`,
  make: 'Freightliner',
  model: 'Cascadia',
  year: 2019,
  vin: '3AKJHHDR9KSJV1234',
}, ACTOR)

await createVehicle(db, {
  customerId: customerB.id,
  unitType: 'truck',
  busNumber: `PVB-${stamp}`,
  make: 'International',
  model: 'MV607',
  year: 2020,
}, ACTOR)

const { hashPassword } = await import('../../server/auth/password')
const passwordHash = await hashPassword('portal-veh-test-123')

const portalUserA = await createPortalUser(db, {
  customerId: customerA.id,
  name: 'Portal Veh A',
  email: `portal-veh-a-${stamp}@test.dorinc.local`,
  passwordHash,
})

await createPortalUser(db, {
  customerId: customerB.id,
  name: 'Portal Veh B',
  email: `portal-veh-b-${stamp}@test.dorinc.local`,
  passwordHash,
})

await createServiceLog(db, {
  customerId: customerA.id,
  vehicleId: vehicleA.id,
  serviceDate: '2026-07-03',
  workType: 'repair',
  complaint: 'DPF regen issue',
}, ACTOR)

afterAll(async () => {
  const custIds = [customerA.id, customerB.id]
  await db.delete(newVehicleRequests).where(inArray(newVehicleRequests.customerId, custIds))
  await db.delete(serviceLogs).where(inArray(serviceLogs.customerId, custIds))
  await db.delete(users).where(like(users.email, `portal-veh-%${stamp}@test.dorinc.local`))
  await db.delete(vehicles).where(inArray(vehicles.customerId, custIds))
  await db.delete(customers).where(inArray(customers.id, custIds))
  await pool.end()
})

describe('P2-06 portal vehicles fleet view', () => {
  it('lists only vehicles for the scoped customer', async () => {
    const listA = await listPortalVehicles(db, customerA.id)
    const listB = await listPortalVehicles(db, customerB.id)

    expect(listA.some(v => v.id === vehicleA.id)).toBe(true)
    expect(listA.find(v => v.id === vehicleA.id)?.vin).toBe('3AKJHHDR9KSJV1234')
    expect(listA.find(v => v.id === vehicleA.id)?.lastServiceDate).toBe('2026-07-03')
    expect(listB.some(v => v.id === vehicleA.id)).toBe(false)
  })
})

describe('P2-06 portal new vehicle request', () => {
  it('creates a pending request for shop review', async () => {
    const request = await createNewVehicleRequest(db, customerA.id, portalUserA.id, {
      fleetTag: `Truck #HL-${stamp}`,
      unitType: 'truck',
      vin: '1HTEUMML7LH552390',
      year: 2022,
      make: 'Freightliner',
      model: 'M2',
      notes: 'New delivery unit',
    })

    expect(request.status).toBe('pending')
    expect(request.fleetTag).toBe(`Truck #HL-${stamp}`)
    expect(request.customerId).toBe(customerA.id)
    expect(request.submittedBy).toBe(portalUserA.id)

    const [stored] = await db.select().from(newVehicleRequests).where(eq(newVehicleRequests.id, request.id))
    expect(stored?.make).toBe('Freightliner')
  })
})
