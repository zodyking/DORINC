import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth/password'
import { generatePortalTempPassword } from '../auth/portal-password'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { buildStaffInviteEmail } from '../mail/templates/system'
import { getAppUrl } from './app-config.service'
import { enqueueJob } from './jobs.service'
import {
  getAssignableAccountTypes,
  isAssignableAccountType,
} from './users.service'
import { TEMP_PASSWORD_TTL_MS } from './portal-access.service'

export type StaffInviteServiceErrorCode
  = | 'EMAIL_IN_USE'
    | 'INVALID_ACCOUNT_TYPE'
    | 'NOT_FOUND'
    | 'NOT_STAFF'
    | 'CUSTOMER_ACCOUNT'

export class StaffInviteServiceError extends Error {
  constructor(public readonly code: StaffInviteServiceErrorCode) {
    super(code)
  }
}

export interface InviteStaffUserInput {
  name: string
  email: string
  accountTypeKey: string
  invitedBy: string
}

async function assertStaffEmailAvailable(db: Db, email: string) {
  const normalized = email.trim().toLowerCase()
  const [existing] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.email, normalized))
  if (existing) throw new StaffInviteServiceError('EMAIL_IN_USE')
}

async function getAccountTypeId(db: Db, key: string) {
  if (!(await isAssignableAccountType(db, key))) {
    throw new StaffInviteServiceError('INVALID_ACCOUNT_TYPE')
  }
  const [row] = await db.select({ id: accountTypes.id }).from(accountTypes).where(eq(accountTypes.key, key))
  if (!row) throw new StaffInviteServiceError('INVALID_ACCOUNT_TYPE')
  return row.id
}

async function sendInviteEmail(db: Db, input: {
  name: string
  email: string
  tempPassword: string
}) {
  const { resolveEmailBrand } = await import('./email-branding.service')
  const brand = await resolveEmailBrand(db)
  const mail = buildStaffInviteEmail({
    name: input.name,
    email: input.email,
    tempPassword: input.tempPassword,
    appUrl: brand?.appUrl || getAppUrl(),
    brand,
  })

  await enqueueJob(db, 'email_send', {
    to: input.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
}

export async function listAssignableStaffAccountTypes(db: Db): Promise<string[]> {
  return getAssignableAccountTypes(db)
}

export async function inviteStaffUser(db: Db, input: InviteStaffUserInput) {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  await assertStaffEmailAvailable(db, email)
  const accountTypeId = await getAccountTypeId(db, input.accountTypeKey)

  const tempPassword = generatePortalTempPassword()
  const now = new Date()
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS)

  const [created] = await db.insert(users).values({
    name,
    email,
    passwordHash: await hashPassword(tempPassword),
    accountTypeId,
    emailVerifiedAt: now,
    approvedAt: now,
    approvedBy: input.invitedBy,
    mustChangePassword: true,
    tempPasswordExpiresAt: expiresAt,
    isActive: true,
  }).returning()

  await sendInviteEmail(db, { name, email, tempPassword })

  const { syncTeamChatParticipants } = await import('./team-chat.service')
  await syncTeamChatParticipants(db)

  return {
    user: created!,
    accountTypeKey: input.accountTypeKey,
  }
}

export async function resendStaffInvite(db: Db, userId: string, invitedBy: string) {
  const [row] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, userId))

  if (!row) throw new StaffInviteServiceError('NOT_FOUND')
  if (row.accountTypeKey === 'customer') throw new StaffInviteServiceError('CUSTOMER_ACCOUNT')
  if (row.accountTypeKey === 'super_admin') throw new StaffInviteServiceError('NOT_STAFF')

  const tempPassword = generatePortalTempPassword()
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS)
  const email = row.user.email.trim().toLowerCase()

  await db.update(users)
    .set({
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
      emailVerifiedAt: row.user.emailVerifiedAt ?? new Date(),
      approvedAt: row.user.approvedAt ?? new Date(),
      approvedBy: row.user.approvedBy ?? invitedBy,
      isActive: true,
      disabledAt: null,
      disabledReason: null,
      rejectedAt: null,
      rejectedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  await sendInviteEmail(db, { name: row.user.name, email, tempPassword })

  return {
    userId,
    email,
    accountTypeKey: row.accountTypeKey,
  }
}
