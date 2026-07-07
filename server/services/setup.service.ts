import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { hashPassword } from '../auth/password'

/** Bootstrap is locked as soon as any Super Admin exists (SPEC §5). */
export async function isBootstrapped(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(accountTypes.key, 'super_admin'))
    .limit(1)
  return !!row
}

export class BootstrapLockedError extends Error {
  constructor() {
    super('BOOTSTRAP_LOCKED')
  }
}

export async function bootstrapSuperAdmin(
  db: Db,
  input: { name: string, email: string, password: string },
) {
  if (await isBootstrapped(db)) throw new BootstrapLockedError()

  const [typeRow] = await db.select().from(accountTypes).where(eq(accountTypes.key, 'super_admin'))
  if (!typeRow) throw new Error('super_admin account type missing — run db:seed')

  const now = new Date()
  const [user] = await db.insert(users).values({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    passwordHash: await hashPassword(input.password),
    accountTypeId: typeRow.id,
    emailVerifiedAt: now, // first-run setup verifies identity in person
    approvedAt: now,
  }).returning()

  return user!
}
