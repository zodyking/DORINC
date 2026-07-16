import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { hashPassword } from '../auth/password'
import type { Db } from '../db/client'
import { accountTypes, sessions, users } from '../db/schema/auth'
import { customerContacts, customers } from '../db/schema/customers'
import { ensureCustomerPortalUser } from './portal-access.service'
import { listContacts } from './customers.service'

export interface StaffEmailCollisionRow {
  contactId: string
  customerId: string
  customerName: string
  customerEmail: string | null
  portalUserId: string
  portalUserEmail: string
  portalUserAccountType: string
  portalUsername: string | null
}

export interface StaffEmailCollisionDiagnosis {
  superAdmins: Array<{
    id: string
    name: string
    email: string
    customerId: string | null
    username: string | null
    isActive: boolean
  }>
  hijackedContacts: StaffEmailCollisionRow[]
}

export async function diagnoseStaffEmailCollisions(db: Db): Promise<StaffEmailCollisionDiagnosis> {
  const superAdmins = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      customerId: users.customerId,
      username: users.username,
      isActive: users.isActive,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(accountTypes.key, 'super_admin'))

  const hijackedContacts = await db
    .select({
      contactId: customerContacts.id,
      customerId: customerContacts.customerId,
      customerName: customers.displayName,
      customerEmail: customers.email,
      portalUserId: customerContacts.portalUserId,
      portalUserEmail: users.email,
      portalUserAccountType: accountTypes.key,
      portalUsername: users.username,
    })
    .from(customerContacts)
    .innerJoin(customers, eq(customerContacts.customerId, customers.id))
    .innerJoin(users, eq(customerContacts.portalUserId, users.id))
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      isNull(customers.archivedAt),
      ne(accountTypes.key, 'customer'),
    ))

  return {
    superAdmins,
    hijackedContacts: hijackedContacts.map(row => ({
      ...row,
      portalUserId: row.portalUserId!,
    })),
  }
}

export interface RepairStaffEmailCollisionInput {
  staffEmail: string
  newPassword: string
  dryRun?: boolean
}

export interface RepairStaffEmailCollisionResult {
  dryRun: boolean
  superAdminId: string
  restoredEmail: string
  unlinkedContactIds: string[]
  recreatedPortalCustomers: string[]
}

/**
 * Restore a Super Admin account after portal setup reused its user row.
 * Unlinks hijacked customer contacts and recreates proper customer portal users.
 */
export async function repairStaffEmailCollision(
  db: Db,
  input: RepairStaffEmailCollisionInput,
): Promise<RepairStaffEmailCollisionResult> {
  const staffEmail = input.staffEmail.trim().toLowerCase()
  if (!staffEmail) throw new Error('staffEmail is required')
  if (input.newPassword.length < 12) throw new Error('newPassword must be at least 12 characters')

  const diagnosis = await diagnoseStaffEmailCollisions(db)
  if (!diagnosis.superAdmins.length) {
    throw new Error('No Super Admin account found')
  }

  const superAdmin = diagnosis.superAdmins.find(a => a.email === staffEmail)
    ?? diagnosis.superAdmins.find(a => diagnosis.hijackedContacts.some(c => c.portalUserId === a.id))
    ?? diagnosis.superAdmins[0]!

  const unlinkedContactIds: string[] = []
  const recreatedPortalCustomers: string[] = []

  const affectedContacts = diagnosis.hijackedContacts.filter(c => c.portalUserId === superAdmin.id)
  const affectedCustomerIds = [...new Set(affectedContacts.map(c => c.customerId))]

  if (input.dryRun) {
    return {
      dryRun: true,
      superAdminId: superAdmin.id,
      restoredEmail: staffEmail,
      unlinkedContactIds: affectedContacts.map(c => c.contactId),
      recreatedPortalCustomers: affectedCustomerIds,
    }
  }

  await db.transaction(async (tx) => {
    if (affectedContacts.length) {
      await tx.update(customerContacts)
        .set({ portalUserId: null, updatedAt: new Date() })
        .where(inArray(customerContacts.id, affectedContacts.map(c => c.contactId)))
      unlinkedContactIds.push(...affectedContacts.map(c => c.contactId))
    }

    const passwordHash = await hashPassword(input.newPassword)
    await tx.update(users)
      .set({
        email: staffEmail,
        customerId: null,
        username: null,
        passwordHash,
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        isActive: true,
        disabledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, superAdmin.id))

    await tx.update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, superAdmin.id), isNull(sessions.revokedAt)))
  })

  for (const customerId of affectedCustomerIds) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId))
    if (!customer?.portalEnabled || !customer.email?.trim()) continue

    const contacts = await listContacts(db, customerId)
    const primary = contacts.find(c => c.isPrimary) ?? contacts[0]
    if (!primary) continue

    await ensureCustomerPortalUser(db, customerId, superAdmin.id)
    recreatedPortalCustomers.push(customerId)
  }

  return {
    dryRun: false,
    superAdminId: superAdmin.id,
    restoredEmail: staffEmail,
    unlinkedContactIds,
    recreatedPortalCustomers,
  }
}
