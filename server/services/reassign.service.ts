import { and, eq, isNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { invoices } from '../db/schema/invoices'
import { serviceLogs } from '../db/schema/service-logs'
import { vehicles } from '../db/schema/vehicles'
import { buildCustomerSnapshot, buildVehicleSnapshot } from './entity-snapshots'
import { CustomersServiceError, getCustomer } from './customers.service'
import {
  getInvoice,
  InvoicesServiceError,
  recalculateInvoiceTotals,
} from './invoices.service'
import {
  getServiceLog,
  ServiceLogsServiceError,
} from './service-logs.service'
import { getVehicle, VehiclesServiceError } from './vehicles.service'
import type {
  ReassignInvoiceCustomerInput,
  ReassignInvoiceVehicleInput,
  ReassignServiceLogInput,
  ReassignServiceLogVehicleInput,
  ReassignVehicleInput,
} from '../../shared/validators/reassign'

export type ReassignServiceErrorCode
  = 'NOT_FOUND' | 'CUSTOMER_NOT_FOUND' | 'CUSTOMER_ARCHIVED' | 'VEHICLE_NOT_FOUND'
    | 'VEHICLE_CUSTOMER_MISMATCH' | 'SAME_CUSTOMER' | 'SAME_VEHICLE' | 'DUPLICATE_BUS_NUMBER'
    | 'NOT_REASSIGNABLE' | 'ALREADY_CONVERTED' | 'NO_CUSTOMER'

export class ReassignServiceError extends Error {
  constructor(public readonly code: ReassignServiceErrorCode) {
    super(code)
  }
}

async function loadActiveCustomer(db: Db, customerId: string) {
  try {
    const customer = await getCustomer(db, customerId)
    if (customer.archivedAt) throw new ReassignServiceError('CUSTOMER_ARCHIVED')
    return customer
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw new ReassignServiceError('CUSTOMER_NOT_FOUND')
    }
    throw err
  }
}

async function assertBusNumberAvailable(
  db: Db,
  customerId: string,
  busNumber: string,
  excludeVehicleId?: string,
) {
  const conditions = [
    eq(vehicles.customerId, customerId),
    eq(vehicles.busNumber, busNumber),
    isNull(vehicles.archivedAt),
  ]
  if (excludeVehicleId) conditions.push(ne(vehicles.id, excludeVehicleId))
  const [dupe] = await db.select({ id: vehicles.id }).from(vehicles).where(and(...conditions))
  if (dupe) throw new ReassignServiceError('DUPLICATE_BUS_NUMBER')
}

async function resolveVehicleForCustomer(db: Db, customerId: string, vehicleId: string | null | undefined) {
  if (!vehicleId) return { vehicleId: null, vehicleSnapshot: null }
  try {
    const vehicle = await getVehicle(db, vehicleId)
    if (vehicle.archivedAt) throw new ReassignServiceError('VEHICLE_NOT_FOUND')
    if (vehicle.customerId !== customerId) throw new ReassignServiceError('VEHICLE_CUSTOMER_MISMATCH')
    return { vehicleId: vehicle.id, vehicleSnapshot: buildVehicleSnapshot(vehicle) }
  }
  catch (err) {
    if (err instanceof VehiclesServiceError && err.code === 'NOT_FOUND') {
      throw new ReassignServiceError('VEHICLE_NOT_FOUND')
    }
    throw err
  }
}

export async function reassignVehicle(
  db: Db,
  vehicleId: string,
  input: ReassignVehicleInput,
  actorId: string,
) {
  let vehicle
  try {
    vehicle = await getVehicle(db, vehicleId)
  }
  catch (err) {
    if (err instanceof VehiclesServiceError && err.code === 'NOT_FOUND') {
      throw new ReassignServiceError('NOT_FOUND')
    }
    throw err
  }

  if (vehicle.archivedAt) throw new ReassignServiceError('NOT_REASSIGNABLE')
  if (vehicle.customerId === input.customerId) throw new ReassignServiceError('SAME_CUSTOMER')

  const customer = await loadActiveCustomer(db, input.customerId)
  if (vehicle.busNumber) {
    await assertBusNumberAvailable(db, input.customerId, vehicle.busNumber, vehicleId)
  }

  const cascade = {
    updateDraftInvoices: input.cascade?.updateDraftInvoices ?? true,
    updateOpenServiceLogs: input.cascade?.updateOpenServiceLogs ?? true,
  }

  const customerSnapshot = buildCustomerSnapshot(customer)
  let draftInvoices = 0
  let openServiceLogs = 0

  if (cascade.updateDraftInvoices) {
    const invoiceRows = await db.select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.vehicleId, vehicleId), ne(invoices.status, 'void')))
    draftInvoices = invoiceRows.length
    if (invoiceRows.length) {
      await db.update(invoices).set({
        customerId: input.customerId,
        customerSnapshot,
        taxExempt: customer.taxExempt,
        paymentTerms: customer.paymentTerms,
        updatedBy: actorId,
        updatedAt: new Date(),
      }).where(and(eq(invoices.vehicleId, vehicleId), ne(invoices.status, 'void')))
      for (const row of invoiceRows) {
        if (row.status === 'draft') {
          await recalculateInvoiceTotals(db, row.id, actorId)
        }
      }
    }
  }

  if (cascade.updateOpenServiceLogs) {
    const logRows = await db.select({ id: serviceLogs.id })
      .from(serviceLogs)
      .where(and(
        eq(serviceLogs.vehicleId, vehicleId),
        isNull(serviceLogs.archivedAt),
        ne(serviceLogs.status, 'converted_to_invoice'),
      ))
    openServiceLogs = logRows.length
    if (logRows.length) {
      await db.update(serviceLogs).set({
        customerId: input.customerId,
        customerSnapshot,
        updatedAt: new Date(),
      }).where(and(
        eq(serviceLogs.vehicleId, vehicleId),
        isNull(serviceLogs.archivedAt),
        ne(serviceLogs.status, 'converted_to_invoice'),
      ))
    }
  }

  const [updated] = await db.update(vehicles).set({
    customerId: input.customerId,
    updatedAt: new Date(),
  }).where(eq(vehicles.id, vehicleId)).returning()

  return {
    vehicle: updated!,
    beforeCustomerId: vehicle.customerId,
    customer,
    affected: { draftInvoices, openServiceLogs },
  }
}

export async function reassignInvoiceCustomer(
  db: Db,
  invoiceId: string,
  input: ReassignInvoiceCustomerInput,
  actorId: string,
) {
  let before
  try {
    before = await getInvoice(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new ReassignServiceError('NOT_FOUND')
    }
    throw err
  }

  if (before.status === 'void') throw new ReassignServiceError('NOT_REASSIGNABLE')
  if (before.customerId === input.customerId) throw new ReassignServiceError('SAME_CUSTOMER')

  const customer = await loadActiveCustomer(db, input.customerId)
  const customerSnapshot = buildCustomerSnapshot(customer)

  let nextVehicleId = before.vehicleId
  if (input.vehicleId !== undefined) {
    const resolved = await resolveVehicleForCustomer(db, input.customerId, input.vehicleId)
    nextVehicleId = resolved.vehicleId
  }
  else if (before.vehicleId) {
    try {
      const vehicle = await getVehicle(db, before.vehicleId)
      if (vehicle.customerId !== input.customerId || vehicle.archivedAt) {
        nextVehicleId = null
      }
    }
    catch {
      nextVehicleId = null
    }
  }

  const vehicleResolved = await resolveVehicleForCustomer(db, input.customerId, nextVehicleId)

  await db.update(invoices).set({
    customerId: input.customerId,
    customerSnapshot,
    taxExempt: customer.taxExempt,
    paymentTerms: customer.paymentTerms,
    vehicleId: vehicleResolved.vehicleId,
    vehicleSnapshot: vehicleResolved.vehicleSnapshot,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId))

  await recalculateInvoiceTotals(db, invoiceId, actorId)
  const invoice = await getInvoice(db, invoiceId)

  return {
    invoice,
    before,
    customer,
    clearedVehicle: !!(before.vehicleId && !vehicleResolved.vehicleId),
  }
}

export async function reassignInvoiceVehicle(
  db: Db,
  invoiceId: string,
  input: ReassignInvoiceVehicleInput,
  actorId: string,
) {
  let before
  try {
    before = await getInvoice(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new ReassignServiceError('NOT_FOUND')
    }
    throw err
  }

  if (before.status === 'void') throw new ReassignServiceError('NOT_REASSIGNABLE')
  if (!before.customerId) throw new ReassignServiceError('NO_CUSTOMER')

  const resolved = await resolveVehicleForCustomer(db, before.customerId, input.vehicleId)

  await db.update(invoices).set({
    vehicleId: resolved.vehicleId,
    vehicleSnapshot: resolved.vehicleSnapshot,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId))

  const invoice = await getInvoice(db, invoiceId)

  return {
    invoice,
    before,
    clearedVehicle: !!(before.vehicleId && !resolved.vehicleId),
  }
}

export async function reassignServiceLog(
  db: Db,
  logId: string,
  input: ReassignServiceLogInput,
  actorId: string,
) {
  void actorId
  let before
  try {
    before = await getServiceLog(db, logId)
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw new ReassignServiceError('NOT_FOUND')
    }
    throw err
  }

  if (before.status === 'converted_to_invoice' || before.archivedAt) {
    throw new ReassignServiceError('NOT_REASSIGNABLE')
  }
  if (before.customerId === input.customerId && before.vehicleId === input.vehicleId) {
    throw new ReassignServiceError('SAME_CUSTOMER')
  }

  const customer = await loadActiveCustomer(db, input.customerId)
  const { vehicleId, vehicleSnapshot } = await resolveVehicleForCustomer(db, input.customerId, input.vehicleId)

  const [updated] = await db.update(serviceLogs).set({
    customerId: input.customerId,
    vehicleId,
    customerSnapshot: buildCustomerSnapshot(customer),
    vehicleSnapshot,
    updatedAt: new Date(),
  }).where(eq(serviceLogs.id, logId)).returning()

  return { log: updated!, before, customer }
}

/** Change only the unit on a service log — customer stays the same. */
export async function reassignServiceLogVehicle(
  db: Db,
  logId: string,
  input: ReassignServiceLogVehicleInput,
  actorId: string,
) {
  void actorId
  let before
  try {
    before = await getServiceLog(db, logId)
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw new ReassignServiceError('NOT_FOUND')
    }
    throw err
  }

  if (before.status === 'converted_to_invoice' || before.archivedAt) {
    throw new ReassignServiceError('NOT_REASSIGNABLE')
  }
  if (!before.customerId) {
    throw new ReassignServiceError('NO_CUSTOMER')
  }
  if (before.vehicleId === input.vehicleId) {
    throw new ReassignServiceError('SAME_VEHICLE')
  }

  const { vehicleId, vehicleSnapshot } = await resolveVehicleForCustomer(
    db,
    before.customerId,
    input.vehicleId,
  )
  if (!vehicleId || !vehicleSnapshot) {
    throw new ReassignServiceError('VEHICLE_NOT_FOUND')
  }

  const [updated] = await db.update(serviceLogs).set({
    vehicleId,
    vehicleSnapshot,
    updatedAt: new Date(),
  }).where(eq(serviceLogs.id, logId)).returning()

  return { log: updated!, before }
}
