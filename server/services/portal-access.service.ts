import { and, desc, eq, isNull } from 'drizzle-orm'
import { hashPassword } from '../auth/password'
import { generatePortalTempPassword } from '../auth/portal-password'
import type { Db } from '../db/client'
import { accountTypes, sessions, users } from '../db/schema/auth'
import {
  customerContacts,
  customerCredentialEmailLogs,
  customers,
} from '../db/schema/customers'
import { allocateUniquePortalUsername } from '../../shared/format/portal-username'
import { enqueueJob } from './jobs.service'
import { addContact, getCustomer, listContacts, updateContact, type ContactInput } from './customers.service'
import { getAppUrl } from './app-config.service'
import { buildPortalCredentialEmail } from '../mail/templates/system'

export const TEMP_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type PortalAccessServiceErrorCode
  = | 'NOT_FOUND'
    | 'PORTAL_DISABLED'
    | 'NOTIFICATION_DISABLED'
    | 'NO_EMAIL'
    | 'EMAIL_IN_USE'
    | 'ALREADY_ENABLED'
    | 'ALREADY_DISABLED'
    | 'CONTACT_NOT_FOUND'

export class PortalAccessServiceError extends Error {
  constructor(public readonly code: PortalAccessServiceErrorCode) {
    super(code)
  }
}

async function getCustomerAccountTypeId(db: Db) {
  const [row] = await db.select({ id: accountTypes.id }).from(accountTypes).where(eq(accountTypes.key, 'customer'))
  if (!row) throw new Error('customer account type missing — run db:seed')
  return row.id
}

function portalAccountEmail(customer: typeof customers.$inferSelect): string {
  const email = customer.email?.trim().toLowerCase()
  if (!email) throw new PortalAccessServiceError('NO_EMAIL')
  return email
}

async function assertEmailAvailableForPortalUser(
  db: Db,
  email: string,
  customerId: string,
  exceptUserId?: string,
) {
  const [existing] = await db.select().from(users).where(eq(users.email, email))
  if (!existing) return
  if (exceptUserId && existing.id === exceptUserId) return
  if (existing.customerId && existing.customerId !== customerId) {
    throw new PortalAccessServiceError('EMAIL_IN_USE')
  }
}

/** Portal access always uses the customer account email — keep contact + login aligned. */
async function ensureContactMatchesAccountEmail(
  db: Db,
  customerId: string,
  customer: typeof customers.$inferSelect,
  contactId?: string,
) {
  const accountEmail = portalAccountEmail(customer)
  const contacts = await listContacts(db, customerId)

  let contact = contactId
    ? contacts.find(c => c.id === contactId)
    : contacts.find(c => c.isPrimary) ?? contacts[0]

  if (contactId && !contact) throw new PortalAccessServiceError('CONTACT_NOT_FOUND')

  if (!contact) {
    contact = await addContact(db, customerId, {
      name: customer.displayName,
      email: accountEmail,
      phone: customer.phone ?? null,
      isPrimary: true,
    })
    return contact
  }

  const patch: Partial<ContactInput> = {}
  if (contact.email?.trim().toLowerCase() !== accountEmail) patch.email = accountEmail
  if (contact.name !== customer.displayName) patch.name = customer.displayName
  if (customer.phone != null && contact.phone !== customer.phone) patch.phone = customer.phone

  if (Object.keys(patch).length) {
    const { contact: updated } = await updateContact(db, customerId, contact.id, patch)
    contact = updated
  }

  return contact
}

async function resolveContact(db: Db, customerId: string, contactId?: string) {
  const customer = await getCustomer(db, customerId)
  return ensureContactMatchesAccountEmail(db, customerId, customer, contactId)
}

async function usernameIsTaken(db: Db, username: string, exceptUserId?: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
  if (!row) return false
  return exceptUserId ? row.id !== exceptUserId : true
}

async function ensurePortalUsername(db: Db, userId: string, displayName: string, existingUsername: string | null) {
  if (existingUsername) return existingUsername
  const username = await allocateUniquePortalUsername(
    displayName,
    candidate => usernameIsTaken(db, candidate, userId),
  )
  await db.update(users)
    .set({ username, updatedAt: new Date() })
    .where(eq(users.id, userId))
  return username
}

export interface PortalUserSummary {
  id: string
  name: string
  email: string
  username: string | null
  contactId: string | null
  mustChangePassword: boolean
  tempPasswordExpiresAt: string | null
  lastLoginAt: string | null
}

export async function getPortalAccessSummary(db: Db, customerId: string) {
  const customer = await getCustomer(db, customerId)
  const contacts = await listContacts(db, customerId)

  const portalUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      mustChangePassword: users.mustChangePassword,
      tempPasswordExpiresAt: users.tempPasswordExpiresAt,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.customerId, customerId),
      eq(accountTypes.key, 'customer'),
      eq(users.isActive, true),
    ))

  const contactByPortalUser = new Map(
    contacts.filter(c => c.portalUserId).map(c => [c.portalUserId!, c.id]),
  )

  const usersSummary: PortalUserSummary[] = []
  for (const u of portalUsers) {
    const [lastSession] = await db
      .select({ lastActivityAt: sessions.lastActivityAt })
      .from(sessions)
      .where(eq(sessions.userId, u.id))
      .orderBy(desc(sessions.lastActivityAt))
      .limit(1)

    usersSummary.push({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      contactId: contactByPortalUser.get(u.id) ?? null,
      mustChangePassword: u.mustChangePassword,
      tempPasswordExpiresAt: u.tempPasswordExpiresAt?.toISOString() ?? null,
      lastLoginAt: lastSession?.lastActivityAt?.toISOString() ?? null,
    })
  }

  const [lastSend] = await db
    .select({ createdAt: customerCredentialEmailLogs.createdAt, status: customerCredentialEmailLogs.status })
    .from(customerCredentialEmailLogs)
    .where(eq(customerCredentialEmailLogs.customerId, customerId))
    .orderBy(desc(customerCredentialEmailLogs.createdAt))
    .limit(1)

  return {
    portalEnabled: customer.portalEnabled,
    userCount: usersSummary.length,
    users: usersSummary,
    lastCredentialEmail: lastSend
      ? { at: lastSend.createdAt.toISOString(), status: lastSend.status }
      : null,
  }
}

export async function setPortalAccess(
  db: Db,
  customerId: string,
  enabled: boolean,
  actorId: string,
  contactId?: string,
) {
  const customer = await getCustomer(db, customerId)
  if (enabled === customer.portalEnabled) {
    return { customer, enabled: customer.portalEnabled }
  }

  if (enabled) {
    const contact = await resolveContact(db, customerId, contactId)
    const accountEmail = portalAccountEmail(customer)
    await ensurePortalUser(db, customerId, contact, accountEmail, actorId)
  }

  const [updated] = await db.update(customers)
    .set({ portalEnabled: enabled, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning()

  return { customer: updated!, enabled }
}

async function ensurePortalUser(
  db: Db,
  customerId: string,
  contact: typeof customerContacts.$inferSelect,
  accountEmail: string,
  _actorId: string,
) {
  const email = accountEmail.trim().toLowerCase()
  const customerAccountTypeId = await getCustomerAccountTypeId(db)
  const customer = await getCustomer(db, customerId)

  let portalUserId: string

  if (contact.portalUserId) {
    const [linked] = await db.select().from(users).where(eq(users.id, contact.portalUserId))
    if (linked) {
      if (linked.email !== email) {
        await assertEmailAvailableForPortalUser(db, email, customerId, linked.id)
        await db.update(users)
          .set({ email, updatedAt: new Date() })
          .where(eq(users.id, linked.id))
      }
      const username = await ensurePortalUsername(db, linked.id, customer.displayName, linked.username)
      await db.update(users)
        .set({
          customerId,
          username,
          isActive: true,
          disabledAt: null,
          emailVerifiedAt: linked.emailVerifiedAt ?? new Date(),
          approvedAt: linked.approvedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, linked.id))
      return linked.id
    }
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email))

  if (existing) {
    if (existing.customerId && existing.customerId !== customerId) {
      throw new PortalAccessServiceError('EMAIL_IN_USE')
    }
    const username = await ensurePortalUsername(db, existing.id, customer.displayName, existing.username)
    const [updated] = await db.update(users)
      .set({
        customerId,
        username,
        isActive: true,
        disabledAt: null,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        approvedAt: existing.approvedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning()
    portalUserId = updated!.id
  }
  else {
    const tempPassword = generatePortalTempPassword()
    const username = await allocateUniquePortalUsername(
      customer.displayName,
      candidate => usernameIsTaken(db, candidate),
    )
    const [created] = await db.insert(users).values({
      name: contact.name,
      email,
      username,
      passwordHash: await hashPassword(tempPassword),
      accountTypeId: customerAccountTypeId,
      customerId,
      emailVerifiedAt: new Date(),
      approvedAt: new Date(),
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + TEMP_PASSWORD_TTL_MS),
    }).returning()
    portalUserId = created!.id
  }

  if (contact.portalUserId !== portalUserId) {
    await db.update(customerContacts)
      .set({ portalUserId, updatedAt: new Date() })
      .where(eq(customerContacts.id, contact.id))
  }

  return portalUserId
}

function buildCredentialEmail(
  name: string,
  username: string,
  tempPassword: string,
  brand?: Awaited<ReturnType<typeof import('./email-branding.service').resolveEmailBrand>>,
) {
  return buildPortalCredentialEmail({
    name,
    username,
    tempPassword,
    appUrl: brand?.appUrl || getAppUrl(),
    brand,
  })
}

export async function sendPortalCredentials(
  db: Db,
  customerId: string,
  sentBy: string,
  contactId?: string,
) {
  const { isNotificationEnabled } = await import('./workspace-settings.service')
  if (!(await isNotificationEnabled(db, 'portalCredentials'))) {
    throw new PortalAccessServiceError('NOTIFICATION_DISABLED')
  }

  const customer = await getCustomer(db, customerId)
  if (!customer.portalEnabled) throw new PortalAccessServiceError('PORTAL_DISABLED')

  const accountEmail = portalAccountEmail(customer)
  const contact = await resolveContact(db, customerId, contactId)

  const portalUserId = await ensurePortalUser(db, customerId, contact, accountEmail, sentBy)
  const tempPassword = generatePortalTempPassword()
  const email = accountEmail
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS)

  const [portalUser] = await db.select().from(users).where(eq(users.id, portalUserId))
  const username = await ensurePortalUsername(
    db,
    portalUserId,
    customer.displayName,
    portalUser?.username ?? null,
  )

  await db.update(users)
    .set({
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, portalUserId))

  const priorSends = await db
    .select({ id: customerCredentialEmailLogs.id })
    .from(customerCredentialEmailLogs)
    .where(and(
      eq(customerCredentialEmailLogs.customerId, customerId),
      eq(customerCredentialEmailLogs.portalUserId, portalUserId),
    ))
    .limit(1)

  const sendType = priorSends.length ? 'resend' as const : 'initial' as const
  const { resolveEmailBrand } = await import('./email-branding.service')
  const brand = await resolveEmailBrand(db)
  const mail = buildCredentialEmail(contact.name, username, tempPassword, brand)

  const [log] = await db.insert(customerCredentialEmailLogs).values({
    customerId,
    contactId: contact.id,
    portalUserId,
    recipientEmail: email,
    sendType,
    status: 'queued',
    sentBy,
  }).returning()

  const job = await enqueueJob(db, 'email_send', {
    credentialLogId: log!.id,
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })

  await db.update(customerCredentialEmailLogs)
    .set({ workerJobId: job.id })
    .where(eq(customerCredentialEmailLogs.id, log!.id))

  return { log: log!, job, sendType, username }
}

export async function listCredentialEmailHistory(db: Db, customerId: string, limit = 25) {
  await getCustomer(db, customerId)

  const rows = await db
    .select({
      id: customerCredentialEmailLogs.id,
      recipientEmail: customerCredentialEmailLogs.recipientEmail,
      sendType: customerCredentialEmailLogs.sendType,
      status: customerCredentialEmailLogs.status,
      sentAt: customerCredentialEmailLogs.sentAt,
      createdAt: customerCredentialEmailLogs.createdAt,
      errorMessage: customerCredentialEmailLogs.errorMessage,
      sentByName: users.name,
    })
    .from(customerCredentialEmailLogs)
    .innerJoin(users, eq(customerCredentialEmailLogs.sentBy, users.id))
    .where(eq(customerCredentialEmailLogs.customerId, customerId))
    .orderBy(desc(customerCredentialEmailLogs.createdAt))
    .limit(limit)

  return rows.map(r => ({
    id: r.id,
    recipientEmail: r.recipientEmail,
    sendType: r.sendType,
    status: r.status,
    sentAt: r.sentAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    errorMessage: r.errorMessage,
    sentByName: r.sentByName,
  }))
}

export async function markCredentialEmailSent(db: Db, credentialLogId: string) {
  await db.update(customerCredentialEmailLogs)
    .set({ status: 'sent', sentAt: new Date() })
    .where(and(
      eq(customerCredentialEmailLogs.id, credentialLogId),
      eq(customerCredentialEmailLogs.status, 'queued'),
    ))
}

export async function markCredentialEmailFailed(db: Db, credentialLogId: string, message: string) {
  await db.update(customerCredentialEmailLogs)
    .set({ status: 'failed', errorMessage: message })
    .where(eq(customerCredentialEmailLogs.id, credentialLogId))
}

export async function isCustomerPortalActive(db: Db, customerId: string | null): Promise<boolean> {
  if (!customerId) return false
  const [row] = await db
    .select({ portalEnabled: customers.portalEnabled, archivedAt: customers.archivedAt })
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.archivedAt)))
  return !!row?.portalEnabled
}
