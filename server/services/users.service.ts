import { and, asc, count, eq, ilike, isNull, notInArray, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import type { AccountType } from '../../shared/permissions/keys'

export type UsersServiceErrorCode
  = | 'NOT_FOUND'
    | 'NOT_PENDING'
    | 'INVALID_ACCOUNT_TYPE'
    | 'SUPER_ADMIN_PROTECTED'

export class UsersServiceError extends Error {
  constructor(public readonly code: UsersServiceErrorCode) {
    super(code)
  }
}

/** Protected account types that cannot be assigned through normal approval/update flows. */
export const PROTECTED_ACCOUNT_TYPES = ['customer', 'super_admin'] as const

/** Default system account types assignable during approval (fallback). */
export const DEFAULT_APPROVABLE_ACCOUNT_TYPES: AccountType[] = [
  'admin', 'manager', 'accountant', 'mechanic', 'viewer', 'external_auditor',
]

/**
 * Get all assignable account types from DB (excludes customer and super_admin).
 * Includes both system roles and custom roles.
 */
export async function getAssignableAccountTypes(db: Db): Promise<string[]> {
  const rows = await db.select({ key: accountTypes.key })
    .from(accountTypes)
    .where(notInArray(accountTypes.key, [...PROTECTED_ACCOUNT_TYPES]))
  return rows.map(r => r.key)
}

/**
 * Check if an account type key is assignable (exists in DB and not protected).
 */
export async function isAssignableAccountType(db: Db, key: string): Promise<boolean> {
  if (PROTECTED_ACCOUNT_TYPES.includes(key as typeof PROTECTED_ACCOUNT_TYPES[number])) {
    return false
  }
  const [row] = await db.select({ id: accountTypes.id })
    .from(accountTypes)
    .where(eq(accountTypes.key, key))
  return !!row
}

async function getUserWithType(db: Db, userId: string) {
  const [row] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, userId))
  return row ?? null
}

export interface ApproveInput {
  userId: string
  approvedBy: string
  /** Optional account type override — defaults to the type requested at signup. */
  accountTypeKey?: string
}

export async function approveUser(db: Db, input: ApproveInput) {
  const row = await getUserWithType(db, input.userId)
  if (!row) throw new UsersServiceError('NOT_FOUND')
  if (row.user.approvedAt || row.user.rejectedAt) throw new UsersServiceError('NOT_PENDING')

  let accountTypeId = row.user.accountTypeId
  let accountTypeKey = row.accountTypeKey

  if (input.accountTypeKey && input.accountTypeKey !== accountTypeKey) {
    // Validate against DB - must exist and not be protected
    if (!(await isAssignableAccountType(db, input.accountTypeKey))) {
      throw new UsersServiceError('INVALID_ACCOUNT_TYPE')
    }
    const [typeRow] = await db.select().from(accountTypes)
      .where(eq(accountTypes.key, input.accountTypeKey))
    if (!typeRow) throw new UsersServiceError('INVALID_ACCOUNT_TYPE')
    accountTypeId = typeRow.id
    accountTypeKey = input.accountTypeKey
  }

  const [updated] = await db.update(users)
    .set({
      approvedAt: new Date(),
      approvedBy: input.approvedBy,
      accountTypeId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId))
    .returning()

  const { syncTeamChatParticipants } = await import('./team-chat.service')
  await syncTeamChatParticipants(db)

  return { user: updated!, accountTypeKey, previousAccountTypeKey: row.accountTypeKey }
}

export interface RejectInput {
  userId: string
  rejectedBy: string
  reason: string
}

export async function rejectUser(db: Db, input: RejectInput) {
  const row = await getUserWithType(db, input.userId)
  if (!row) throw new UsersServiceError('NOT_FOUND')
  if (row.user.approvedAt || row.user.rejectedAt) throw new UsersServiceError('NOT_PENDING')

  // Rejected users are also deactivated so login fails hard (SPEC §5, §22.14)
  const [updated] = await db.update(users)
    .set({
      rejectedAt: new Date(),
      rejectedReason: input.reason,
      isActive: false,
      disabledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId))
    .returning()

  return { user: updated!, accountTypeKey: row.accountTypeKey as AccountType }
}

export interface UpdateUserInput {
  userId: string
  actor: { id: string, accountType: string }
  accountTypeKey?: string
  isActive?: boolean
  /** Reason for deactivation (suspension). Only used when isActive=false. */
  disabledReason?: string
}

/**
 * Update account type / active flag. Super Admin records can only be
 * modified by a Super Admin, and nobody can be promoted to super_admin
 * through this path (SPEC §4).
 */
export async function updateUser(db: Db, input: UpdateUserInput) {
  const row = await getUserWithType(db, input.userId)
  if (!row) throw new UsersServiceError('NOT_FOUND')

  const targetIsSuperAdmin = row.accountTypeKey === 'super_admin'
  if (targetIsSuperAdmin && input.actor.accountType !== 'super_admin') {
    throw new UsersServiceError('SUPER_ADMIN_PROTECTED')
  }

  const changes: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
  const changedFields: string[] = []
  let accountTypeKey = row.accountTypeKey

  if (input.accountTypeKey && input.accountTypeKey !== accountTypeKey) {
    // Cannot change super_admin role or assign to protected types
    if (targetIsSuperAdmin || !(await isAssignableAccountType(db, input.accountTypeKey))) {
      throw new UsersServiceError('INVALID_ACCOUNT_TYPE')
    }
    const [typeRow] = await db.select().from(accountTypes)
      .where(eq(accountTypes.key, input.accountTypeKey))
    if (!typeRow) throw new UsersServiceError('INVALID_ACCOUNT_TYPE')
    changes.accountTypeId = typeRow.id
    changedFields.push('accountTypeId')
    accountTypeKey = input.accountTypeKey
  }

  if (input.isActive !== undefined && input.isActive !== row.user.isActive) {
    if (targetIsSuperAdmin && !input.isActive) {
      throw new UsersServiceError('SUPER_ADMIN_PROTECTED')
    }
    changes.isActive = input.isActive
    changes.disabledAt = input.isActive ? null : new Date()
    changes.disabledReason = input.isActive ? null : (input.disabledReason?.trim() || null)
    changedFields.push('isActive', 'disabledAt')
    if (!input.isActive && input.disabledReason) {
      changedFields.push('disabledReason')
    }
  }

  if (!changedFields.length) {
    return { user: row.user, accountTypeKey, changedFields, previous: row }
  }

  const [updated] = await db.update(users)
    .set(changes)
    .where(eq(users.id, input.userId))
    .returning()

  return { user: updated!, accountTypeKey, changedFields, previous: row }
}

export interface ListUsersFilter {
  q?: string
  status?: 'pending' | 'active' | 'disabled' | 'rejected'
  accountType?: string
  page: number
  pageSize: number
}

export function userStatus(user: {
  isActive: boolean
  approvedAt: Date | null
  rejectedAt: Date | null
  emailVerifiedAt: Date | null
  disabledReason?: string | null
}): 'pending' | 'active' | 'disabled' | 'rejected' | 'suspended' {
  if (user.rejectedAt) return 'rejected'
  if (!user.isActive) {
    return user.disabledReason ? 'suspended' : 'disabled'
  }
  if (!user.approvedAt) return 'pending'
  return 'active'
}

export async function listUsers(db: Db, filter: ListUsersFilter) {
  const conditions = []

  if (filter.q) {
    conditions.push(or(
      ilike(users.name, `%${filter.q}%`),
      ilike(users.email, `%${filter.q}%`),
    ))
  }
  if (filter.accountType) {
    conditions.push(eq(accountTypes.key, filter.accountType))
  }
  if (filter.status === 'pending') {
    conditions.push(and(isNull(users.approvedAt), isNull(users.rejectedAt), eq(users.isActive, true)))
  }
  else if (filter.status === 'rejected') {
    conditions.push(eq(users.isActive, false))
  }
  else if (filter.status === 'disabled') {
    conditions.push(eq(users.isActive, false))
  }
  else if (filter.status === 'active') {
    conditions.push(and(eq(users.isActive, true)))
  }

  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(where)
    .orderBy(asc(users.name))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db
    .select({ value: count() })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(where)

  let items = rows.map(r => ({
    id: r.user.id,
    name: r.user.name,
    email: r.user.email,
    accountType: r.accountTypeKey,
    status: userStatus(r.user),
    emailVerified: !!r.user.emailVerifiedAt,
    createdAt: r.user.createdAt,
  }))

  // rejected vs disabled share isActive=false at the SQL level — refine here
  if (filter.status === 'rejected') items = items.filter(i => i.status === 'rejected')
  if (filter.status === 'disabled') items = items.filter(i => i.status === 'disabled')
  if (filter.status === 'active') items = items.filter(i => i.status === 'active')

  return { items, total: total!.value, page: filter.page, pageSize: filter.pageSize }
}

export async function getUserDetail(db: Db, userId: string) {
  const row = await getUserWithType(db, userId)
  if (!row) throw new UsersServiceError('NOT_FOUND')
  return {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    accountType: row.accountTypeKey,
    status: userStatus(row.user),
    emailVerified: !!row.user.emailVerifiedAt,
    emailVerifiedAt: row.user.emailVerifiedAt,
    approvedAt: row.user.approvedAt,
    approvedBy: row.user.approvedBy,
    rejectedAt: row.user.rejectedAt,
    rejectedReason: row.user.rejectedReason,
    isActive: row.user.isActive,
    disabledAt: row.user.disabledAt,
    disabledReason: row.user.disabledReason,
    customerId: row.user.customerId,
    createdAt: row.user.createdAt,
    updatedAt: row.user.updatedAt,
  }
}
