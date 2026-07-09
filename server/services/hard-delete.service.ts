import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { customers } from '../db/schema/customers'
import { estimates } from '../db/schema/estimates'
import { invoiceLineItems, invoices } from '../db/schema/invoices'
import { serviceLogs } from '../db/schema/service-logs'
import { vehicles } from '../db/schema/vehicles'
import { buildCustomerSnapshot, buildVehicleSnapshot } from './entity-snapshots'
import { CustomersServiceError, getCustomer } from './customers.service'
import { getInvoice, InvoicesServiceError } from './invoices.service'
import { getServiceLog, ServiceLogsServiceError } from './service-logs.service'
import { getVehicle, VehiclesServiceError } from './vehicles.service'

/**
 * Hard-delete entities while preserving related history via JSON snapshots.
 * FK columns become NULL (ON DELETE SET NULL) after dependents are snapshotted.
 */

async function ensureCustomerSnapshots(db: Db, customerId: string, snapshot: ReturnType<typeof buildCustomerSnapshot>) {
  await db.update(invoices)
    .set({ customerSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(invoices.customerId, customerId))

  await db.update(estimates)
    .set({ customerSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(estimates.customerId, customerId))

  await db.update(serviceLogs)
    .set({ customerSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(serviceLogs.customerId, customerId))
}

async function ensureVehicleSnapshots(db: Db, vehicleId: string, snapshot: ReturnType<typeof buildVehicleSnapshot>) {
  await db.update(invoices)
    .set({ vehicleSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(invoices.vehicleId, vehicleId))

  await db.update(estimates)
    .set({ vehicleSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(estimates.vehicleId, vehicleId))

  await db.update(serviceLogs)
    .set({ vehicleSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(serviceLogs.vehicleId, vehicleId))
}

export async function hardDeleteVehicle(db: Db, id: string) {
  const vehicle = await getVehicle(db, id)
  const snapshot = buildVehicleSnapshot(vehicle)
  await ensureVehicleSnapshots(db, id, snapshot)
  await db.delete(vehicles).where(eq(vehicles.id, id))
  return { id, snapshot }
}

export async function hardDeleteCustomer(db: Db, id: string) {
  const customer = await getCustomer(db, id)
  const snapshot = buildCustomerSnapshot(customer)
  await ensureCustomerSnapshots(db, id, snapshot)

  const ownedVehicles = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.customerId, id))
  for (const v of ownedVehicles) {
    await hardDeleteVehicle(db, v.id)
  }

  await db.update(users)
    .set({
      customerId: null,
      isActive: false,
      disabledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.customerId, id))

  await db.delete(customers).where(eq(customers.id, id))
  return { id, snapshot }
}

export async function hardDeleteServiceLog(db: Db, id: string) {
  const log = await getServiceLog(db, id)

  if (!log.customerSnapshot && log.customerId) {
    try {
      const customer = await getCustomer(db, log.customerId)
      await db.update(serviceLogs)
        .set({ customerSnapshot: buildCustomerSnapshot(customer), updatedAt: new Date() })
        .where(eq(serviceLogs.id, id))
    }
    catch (err) {
      if (!(err instanceof CustomersServiceError)) throw err
    }
  }

  if (!log.vehicleSnapshot && log.vehicleId) {
    try {
      const vehicle = await getVehicle(db, log.vehicleId)
      await db.update(serviceLogs)
        .set({ vehicleSnapshot: buildVehicleSnapshot(vehicle), updatedAt: new Date() })
        .where(eq(serviceLogs.id, id))
    }
    catch (err) {
      if (!(err instanceof VehiclesServiceError)) throw err
    }
  }

  await db.update(invoices)
    .set({ serviceLogId: null, updatedAt: new Date() })
    .where(eq(invoices.serviceLogId, id))

  await db.update(estimates)
    .set({ serviceLogId: null, updatedAt: new Date() })
    .where(eq(estimates.serviceLogId, id))

  await db.delete(serviceLogs).where(eq(serviceLogs.id, id))
  return { id }
}

export async function hardDeleteInvoice(db: Db, id: string) {
  const invoice = await getInvoice(db, id)
  if (invoice.status === 'paid') throw new InvoicesServiceError('INVALID_TRANSITION')

  await db.update(serviceLogs)
    .set({ invoiceId: null, updatedAt: new Date() })
    .where(eq(serviceLogs.invoiceId, id))

  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id))
  await db.delete(invoices).where(eq(invoices.id, id))
  return { id }
}

export {
  CustomersServiceError,
  InvoicesServiceError,
  ServiceLogsServiceError,
  VehiclesServiceError,
}
