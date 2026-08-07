import { and, asc, eq, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'

export interface TechnicianOption {
  id: string
  name: string
  email: string
  accountType: string
}

/**
 * Mechanics when any active mechanic exists; otherwise all active non-customer staff.
 */
export async function listTechnicianOptions(db: Db): Promise<{
  items: TechnicianOption[]
  source: 'mechanics' | 'all_staff'
}> {
  const mechanics = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      accountType: accountTypes.key,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.isActive, true),
      eq(accountTypes.key, 'mechanic'),
    ))
    .orderBy(asc(users.name))

  if (mechanics.length) {
    return { items: mechanics, source: 'mechanics' }
  }

  const staff = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      accountType: accountTypes.key,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.isActive, true),
      ne(accountTypes.key, 'customer'),
    ))
    .orderBy(asc(users.name))

  return { items: staff, source: 'all_staff' }
}

export async function assertActiveStaffUser(db: Db, userId: string): Promise<TechnicianOption> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      accountType: accountTypes.key,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.id, userId),
      eq(users.isActive, true),
      ne(accountTypes.key, 'customer'),
    ))
  if (!row) throw new Error('TECHNICIAN_NOT_FOUND')
  return row
}
