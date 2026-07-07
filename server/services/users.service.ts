import { and, asc, count, eq, ilike, isNull, or } from 'drizzle-orm'
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

/** Account types assignable during approval — never customer or super_admin. */
export const APPROVABLE_ACCOUNT_TYPES: AccountType[] = [
  'admin', 'manager', 'accountant', 'mechanic', 'viewer', 'external_auditor',
]

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
  accountTypeKey?: AccountType
}

export async function approveUser(db: Db, input: ApproveInput) {
  const row = await getUserWithType(db, input.userId)
  if (!row) throw new UsersServiceError('NOT_FOUND')
  if (row.user.approvedAt || row.user.rejectedAt) throw new UsersServiceError('NOT_PENDING')

  let accountTypeId = row.user.accountTypeId
  let accountTypeKey = row.accountTypeKey as AccountType

  if (input.accountTypeKey && input.accountTypeKey !== accountTypeKey) {
    if (!APPROVABLE_ACCOUNT_TYPES.includes(input.accountTypeKey)) {
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

  return { user: updated!, accountTypeKey, previousAccountTypeKey: row.accountTypeKey as AccountType }
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

export interface ListUsersFilter {
  q?: string
  status?: 'pending' | 'active' | 'disabled' | 'rejected'
  accountType?: AccountType
  page: number
  pageSize: number
}

export function userStatus(user: {
  isActive: boolean
  approvedAt: Date | null
  rejectedAt: Date | null
  emailVerifiedAt: Date | null
}): 'pending' | 'active' | 'disabled' | 'rejected' {
  if (user.rejectedAt) return 'rejected'
  if (!user.isActive) return 'disabled'
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
    accountType: r.accountTypeKey as AccountType,
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
    accountType: row.accountTypeKey as AccountType,
    status: userStatus(row.user),
    emailVerified: !!row.user.emailVerifiedAt,
    emailVerifiedAt: row.user.emailVerifiedAt,
    approvedAt: row.user.approvedAt,
    approvedBy: row.user.approvedBy,
    rejectedAt: row.user.rejectedAt,
    rejectedReason: row.user.rejectedReason,
    isActive: row.user.isActive,
    disabledAt: row.user.disabledAt,
    customerId: row.user.customerId,
    createdAt: row.user.createdAt,
    updatedAt: row.user.updatedAt,
  }
}
