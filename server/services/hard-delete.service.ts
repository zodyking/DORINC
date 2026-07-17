import { and, count, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, sessions, userPermissionOverrides, users } from '../db/schema/auth'
import { customerCredentialEmailLogs, customerContacts, customers } from '../db/schema/customers'
import { entityDeletionRequests } from '../db/schema/deletion-requests'
import { editingSessions } from '../db/schema/editing-sessions'
import { estimates, estimateFiles, estimateLineItems } from '../db/schema/estimates'
import { invoiceFiles, invoiceLineItems, invoices } from '../db/schema/invoices'
import { emailIngestSuppressions, emailMessageMeta, emailThreads } from '../db/schema/email-inbox'
import { conversations, messages } from '../db/schema/messages'
import {
  documentChangeRequests,
  invoiceChangeRequests,
  newVehicleRequests,
  portalGeneralRequests,
  serviceRequests,
  vehicleChangeRequests,
} from '../db/schema/portal-requests'
import { serviceLogs } from '../db/schema/service-logs'
import { vehicles } from '../db/schema/vehicles'
import { catalogItems, catalogLaborRates } from '../db/schema/catalog'
import { appFiles } from '../db/schema/files'
import { aiJobs, aiProviderSettings, aiSuggestions, aiUsageLogs } from '../db/schema/ai'
import { backupIntegrations, backupRuns, backupSettings } from '../db/schema/backups'
import { invoiceTemplateVersions, invoiceTemplates } from '../db/schema/invoice-templates'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'
import { buildCustomerSnapshot, buildVehicleSnapshot } from './entity-snapshots'
import { CustomersServiceError, getCustomer } from './customers.service'
import { releaseInvoiceDependents } from './invoice-dependents.service'
import { getInvoice, InvoicesServiceError } from './invoices.service'
import { getConversationDeletionLabel } from './messages.service'
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

  await releaseInvoiceDependents(db, id)

  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id))
  await db.delete(invoices).where(eq(invoices.id, id))
  return { id }
}

export async function hardDeleteConversation(db: Db, id: string, actorId?: string | null) {
  await getConversationDeletionLabel(db, id)

  const [emailThread] = await db.select({
    counterpartEmail: emailThreads.counterpartEmail,
    subject: emailThreads.subject,
  })
    .from(emailThreads)
    .where(eq(emailThreads.conversationId, id))
    .limit(1)

  const messageRows = await db.select({
    id: messages.id,
    internetMessageId: emailMessageMeta.internetMessageId,
  })
    .from(messages)
    .leftJoin(emailMessageMeta, eq(emailMessageMeta.messageId, messages.id))
    .where(eq(messages.conversationId, id))
  const messageIds = messageRows.map(r => r.id)

  const internetMessageIds = messageRows
    .map(row => row.internetMessageId?.trim())
    .filter((messageId): messageId is string => !!messageId)
  if (emailThread && internetMessageIds.length) {
    await db.insert(emailIngestSuppressions).values(
      internetMessageIds.map(internetMessageId => ({
        internetMessageId,
        sourceConversationId: id,
        counterpartEmail: emailThread.counterpartEmail,
        subject: emailThread.subject,
        deletedBy: actorId ?? null,
      })),
    ).onConflictDoNothing()
  }

  if (messageIds.length) {
    await db.delete(appFiles).where(and(
      eq(appFiles.ownerEntityType, 'message'),
      inArray(appFiles.ownerEntityId, messageIds),
    ))
  }

  await db.delete(conversations).where(eq(conversations.id, id))
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

/** Clear nullable user FK columns so DELETE users succeeds without orphan violations. */
async function nullifyUserAttribution(db: Db, userId: string) {
  const now = new Date()

  await db.update(customerContacts)
    .set({ portalUserId: null, updatedAt: now })
    .where(eq(customerContacts.portalUserId, userId))

  await db.update(customers)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(customers.createdBy, userId))

  await db.update(vehicles)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(vehicles.createdBy, userId))

  await db.update(catalogItems)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(catalogItems.createdBy, userId))

  await db.update(catalogLaborRates)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(catalogLaborRates.createdBy, userId))

  await db.update(appFiles)
    .set({ createdBy: null })
    .where(eq(appFiles.createdBy, userId))

  await db.update(invoices)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(invoices.createdBy, userId))
  await db.update(invoices)
    .set({ updatedBy: null, updatedAt: now })
    .where(eq(invoices.updatedBy, userId))
  await db.update(invoices)
    .set({ approvedBy: null, updatedAt: now })
    .where(eq(invoices.approvedBy, userId))
  await db.update(invoices)
    .set({ submittedForApprovalBy: null, updatedAt: now })
    .where(eq(invoices.submittedForApprovalBy, userId))

  await db.update(invoiceLineItems)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(invoiceLineItems.createdBy, userId))
  await db.update(invoiceLineItems)
    .set({ updatedBy: null, updatedAt: now })
    .where(eq(invoiceLineItems.updatedBy, userId))

  await db.update(invoiceFiles)
    .set({ createdBy: null })
    .where(eq(invoiceFiles.createdBy, userId))

  await db.update(estimates)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(estimates.createdBy, userId))
  await db.update(estimates)
    .set({ updatedBy: null, updatedAt: now })
    .where(eq(estimates.updatedBy, userId))
  await db.update(estimates)
    .set({ approvedBy: null, updatedAt: now })
    .where(eq(estimates.approvedBy, userId))
  await db.update(estimates)
    .set({ sentBy: null, updatedAt: now })
    .where(eq(estimates.sentBy, userId))
  await db.update(estimates)
    .set({ customerApprovedBy: null, updatedAt: now })
    .where(eq(estimates.customerApprovedBy, userId))
  await db.update(estimates)
    .set({ customerRejectedBy: null, updatedAt: now })
    .where(eq(estimates.customerRejectedBy, userId))
  await db.update(estimates)
    .set({ convertedBy: null, updatedAt: now })
    .where(eq(estimates.convertedBy, userId))

  await db.update(estimateLineItems)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(estimateLineItems.createdBy, userId))
  await db.update(estimateLineItems)
    .set({ updatedBy: null, updatedAt: now })
    .where(eq(estimateLineItems.updatedBy, userId))

  await db.update(estimateFiles)
    .set({ createdBy: null })
    .where(eq(estimateFiles.createdBy, userId))

  await db.update(invoiceTemplates)
    .set({ createdBy: null, updatedAt: now })
    .where(eq(invoiceTemplates.createdBy, userId))
  await db.update(invoiceTemplateVersions)
    .set({ createdBy: null })
    .where(eq(invoiceTemplateVersions.createdBy, userId))
  await db.update(invoiceTemplateVersions)
    .set({ publishedBy: null })
    .where(eq(invoiceTemplateVersions.publishedBy, userId))

  await db.update(pdfRenderJobs)
    .set({ createdBy: null })
    .where(eq(pdfRenderJobs.createdBy, userId))

  await db.update(aiProviderSettings)
    .set({ updatedBy: null, updatedAt: now })
    .where(eq(aiProviderSettings.updatedBy, userId))
  await db.update(aiJobs)
    .set({ createdBy: null })
    .where(eq(aiJobs.createdBy, userId))
  await db.update(aiSuggestions)
    .set({ reviewedBy: null })
    .where(eq(aiSuggestions.reviewedBy, userId))
  await db.update(aiUsageLogs)
    .set({ createdBy: null })
    .where(eq(aiUsageLogs.createdBy, userId))

  await db.update(backupIntegrations)
    .set({ updatedBy: null, updatedAt: now })
    .where(eq(backupIntegrations.updatedBy, userId))
  await db.update(backupSettings)
    .set({ updatedBy: null, updatedAt: now })
    .where(eq(backupSettings.updatedBy, userId))
  await db.update(backupRuns)
    .set({ createdBy: null })
    .where(eq(backupRuns.createdBy, userId))

  await db.update(entityDeletionRequests)
    .set({ reviewedBy: null, updatedAt: now })
    .where(eq(entityDeletionRequests.reviewedBy, userId))

  await db.update(newVehicleRequests)
    .set({ reviewedBy: null, updatedAt: now })
    .where(eq(newVehicleRequests.reviewedBy, userId))
  await db.update(serviceRequests)
    .set({ reviewedBy: null, updatedAt: now })
    .where(eq(serviceRequests.reviewedBy, userId))
  await db.update(invoiceChangeRequests)
    .set({ reviewedBy: null, updatedAt: now })
    .where(eq(invoiceChangeRequests.reviewedBy, userId))
  await db.update(vehicleChangeRequests)
    .set({ reviewedBy: null, updatedAt: now })
    .where(eq(vehicleChangeRequests.reviewedBy, userId))
  await db.update(portalGeneralRequests)
    .set({ reviewedBy: null, updatedAt: now })
    .where(eq(portalGeneralRequests.reviewedBy, userId))
  await db.update(documentChangeRequests)
    .set({ reviewedBy: null, updatedAt: now })
    .where(eq(documentChangeRequests.reviewedBy, userId))

  await db.update(userPermissionOverrides)
    .set({ createdBy: null })
    .where(eq(userPermissionOverrides.createdBy, userId))
}

/**
 * Hard-delete a user with preflight checks and audit snapshot.
 * Fails if the user is a super_admin, trying to delete themselves, or has NOT NULL dependent records.
 */
export async function hardDeleteUser(
  db: Db,
  userId: string,
  actorId: string,
  _reason?: string,
): Promise<{ id: string, snapshot: ReturnType<typeof buildUserSnapshot> }> {
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
  const [serviceLogCount] = await db.select({ count: count() })
    .from(serviceLogs)
    .where(eq(serviceLogs.submittedBy, userId))
  if (serviceLogCount && Number(serviceLogCount.count) > 0) {
    blockers.push(`${serviceLogCount.count} service log(s)`)
  }

  if (blockers.length > 0) {
    throw new HardDeleteUserServiceError('HAS_DEPENDENTS', blockers)
  }

  // Create snapshot for audit
  const snapshot = buildUserSnapshot(row.user, row.accountTypeKey)

  // Remove rows that block deletion (NOT NULL FK without cascade)
  await db.delete(messages).where(eq(messages.senderUserId, userId))
  await db.delete(editingSessions).where(eq(editingSessions.userId, userId))
  await db.delete(entityDeletionRequests).where(eq(entityDeletionRequests.submittedBy, userId))
  await db.delete(customerCredentialEmailLogs).where(eq(customerCredentialEmailLogs.sentBy, userId))
  await db.delete(customerCredentialEmailLogs).where(eq(customerCredentialEmailLogs.portalUserId, userId))
  await db.delete(newVehicleRequests).where(eq(newVehicleRequests.submittedBy, userId))
  await db.delete(serviceRequests).where(eq(serviceRequests.submittedBy, userId))
  await db.delete(invoiceChangeRequests).where(eq(invoiceChangeRequests.submittedBy, userId))
  await db.delete(vehicleChangeRequests).where(eq(vehicleChangeRequests.submittedBy, userId))
  await db.delete(portalGeneralRequests).where(eq(portalGeneralRequests.submittedBy, userId))
  await db.delete(documentChangeRequests).where(eq(documentChangeRequests.submittedBy, userId))

  await nullifyUserAttribution(db, userId)

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
  InvoicesServiceError,
  ServiceLogsServiceError,
  VehiclesServiceError,
}
