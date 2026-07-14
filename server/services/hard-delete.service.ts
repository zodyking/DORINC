import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, sessions, userPermissionOverrides, users } from '../db/schema/auth'
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

export type HardDeleteUserError = 'NOT_FOUND' | 'SUPER_ADMIN_PROTECTED' | 'SELF_DELETE' | 'HAS_DEPENDENTS'

export class HardDeleteUserServiceError extends Error {
  constructor(public readonly code: HardDeleteUserError, public readonly details?: string[]) {
    super(code)
  }
}

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

/**
 * Build a user snapshot for audit purposes before hard deletion.
 */
function buildUserSnapshot(user: typeof users.$inferSelect, accountTypeKey: string) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    accountType: accountTypeKey,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    approvedAt: user.approvedAt?.toISOString() ?? null,
    rejectedAt: user.rejectedAt?.toISOString() ?? null,
    customerId: user.customerId,
    createdAt: user.createdAt.toISOString(),
    deletedAt: new Date().toISOString(),
  }
}

/**
 * Hard-delete a user with preflight checks and audit snapshot.
 * Fails if the user is a super_admin, trying to delete themselves, or has NOT NULL dependent records.
 */
export async function hardDeleteUser(
  db: Db,
  userId: string,
  actorId: string,
  reason?: string,
): Promise<{ id: string, snapshot: ReturnType<typeof buildUserSnapshot> }> {
  // Get user with account type
  const [row] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, userId))

  if (!row) {
    throw new HardDeleteUserServiceError('NOT_FOUND')
  }

  // Cannot delete super_admin
  if (row.accountTypeKey === 'super_admin') {
    throw new HardDeleteUserServiceError('SUPER_ADMIN_PROTECTED')
  }

  // Cannot delete yourself
  if (userId === actorId) {
    throw new HardDeleteUserServiceError('SELF_DELETE')
  }

  // Check for NOT NULL FK blockers
  // These tables have NOT NULL user references that would prevent deletion
  const blockers: string[] = []

  // Check service_logs.submitted_by (NOT NULL)
  const [serviceLogCount] = await db.select({ count: db.$count(serviceLogs) })
    .from(serviceLogs)
    .where(eq(serviceLogs.submittedBy, userId))
  if (serviceLogCount && serviceLogCount.count > 0) {
    blockers.push(`${serviceLogCount.count} service log(s)`)
  }

  if (blockers.length > 0) {
    throw new HardDeleteUserServiceError('HAS_DEPENDENTS', blockers)
  }

  // Create snapshot for audit
  const snapshot = buildUserSnapshot(row.user, row.accountTypeKey)

  // Nullify nullable user-attribution FKs across the database
  // These columns have ON DELETE SET NULL or we manually set them
  await db.update(customers)
    .set({ sentBy: null, updatedAt: new Date() })
    .where(eq(customers.sentBy, userId))

  await db.update(invoices)
    .set({ createdBy: null, updatedAt: new Date() })
    .where(eq(invoices.createdBy, userId))

  await db.update(invoices)
    .set({ approvedBy: null, updatedAt: new Date() })
    .where(eq(invoices.approvedBy, userId))

  await db.update(invoices)
    .set({ sentBy: null, updatedAt: new Date() })
    .where(eq(invoices.sentBy, userId))

  await db.update(estimates)
    .set({ createdBy: null, updatedAt: new Date() })
    .where(eq(estimates.createdBy, userId))

  await db.update(estimates)
    .set({ sentBy: null, updatedAt: new Date() })
    .where(eq(estimates.sentBy, userId))

  await db.update(vehicles)
    .set({ createdBy: null, updatedAt: new Date() })
    .where(eq(vehicles.createdBy, userId))

  // Delete user's sessions (cascade should handle this, but be explicit)
  await db.delete(sessions).where(eq(sessions.userId, userId))

  // Delete user's permission overrides (cascade should handle this, but be explicit)
  await db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId))

  // Finally, delete the user
  await db.delete(users).where(eq(users.id, userId))

  return { id: userId, snapshot }
}

export {
  CustomersServiceError,
  HardDeleteUserServiceError,
  InvoicesServiceError,
  ServiceLogsServiceError,
  VehiclesServiceError,
}
