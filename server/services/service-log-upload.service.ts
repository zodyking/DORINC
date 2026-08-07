import { createHash, randomBytes } from 'node:crypto'
import { and, count, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { customers } from '../db/schema/customers'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import {
  serviceLogUploadSessions,
  type ServiceLogUploadSessionStatus,
} from '../db/schema/service-log-upload-sessions'
import { vehicles } from '../db/schema/vehicles'
import { appFiles } from '../db/schema/files'
import { getAppUrl } from './app-config.service'
import {
  createServiceLog,
  getServiceLog,
  transitionServiceLog,
} from './service-logs.service'
import { assertActiveStaffUser } from './technicians.service'
import { postServiceLogUploadedForInvoiceTeamMessage } from './workflow-chat.service'
import { formatVehicleUnitLabel } from '../../shared/format/vehicle-unit'

export const SERVICE_LOG_UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000

export type ServiceLogUploadServiceErrorCode
  = | 'NOT_FOUND'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'ALREADY_COMPLETED'
    | 'TECHNICIAN_NOT_FOUND'
    | 'INVOICE_NOT_FOUND'
    | 'CUSTOMER_NOT_FOUND'
    | 'VEHICLE_NOT_FOUND'
    | 'NO_PHOTOS'

export class ServiceLogUploadServiceError extends Error {
  constructor(public readonly code: ServiceLogUploadServiceErrorCode) {
    super(code)
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function mintToken(): string {
  return randomBytes(24).toString('base64url')
}

export function publicUploadPath(token: string): string {
  return `/upload/service-log/${token}`
}

export function publicUploadUrl(token: string): string {
  const base = getAppUrl().replace(/\/$/, '')
  return `${base}${publicUploadPath(token)}`
}

async function loadSessionContext(db: Db, session: typeof serviceLogUploadSessions.$inferSelect) {
  const [[customer], [vehicle], [technician], [invoice], [creator]] = await Promise.all([
    db.select({ id: customers.id, displayName: customers.displayName })
      .from(customers).where(eq(customers.id, session.customerId)).limit(1),
    db.select({
      id: vehicles.id,
      busNumber: vehicles.busNumber,
      unitTag: vehicles.unitTag,
      unitType: vehicles.unitType,
    }).from(vehicles).where(eq(vehicles.id, session.vehicleId)).limit(1),
    db.select({ id: users.id, name: users.name })
      .from(users).where(eq(users.id, session.technicianId)).limit(1),
    session.invoiceId
      ? db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
        .from(invoices).where(eq(invoices.id, session.invoiceId)).limit(1)
      : Promise.resolve([]),
    db.select({ id: users.id, name: users.name })
      .from(users).where(eq(users.id, session.createdBy)).limit(1),
  ])

  const vehicleLabel = vehicle
    ? formatVehicleUnitLabel({
        unitType: vehicle.unitType,
        busNumber: vehicle.busNumber,
        unitTag: vehicle.unitTag,
      })
    : 'Vehicle'

  return {
    customerName: customer?.displayName ?? 'Customer',
    vehicleLabel,
    technicianName: technician?.name ?? 'Technician',
    creatorName: creator?.name ?? 'Staff',
    invoiceNumber: invoice?.invoiceNumber ?? null,
    invoiceNumberFormatted: invoice ? formatInvoiceNumber(invoice.invoiceNumber) : null,
  }
}

export async function createServiceLogUploadSession(
  db: Db,
  input: {
    createdBy: string
    technicianId: string
    customerId: string
    vehicleId: string
    invoiceId?: string | null
    serviceDate?: string
  },
) {
  try {
    await assertActiveStaffUser(db, input.technicianId)
  }
  catch {
    throw new ServiceLogUploadServiceError('TECHNICIAN_NOT_FOUND')
  }

  if (input.invoiceId) {
    const [inv] = await db.select({ id: invoices.id })
      .from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1)
    if (!inv) throw new ServiceLogUploadServiceError('INVOICE_NOT_FOUND')
  }

  const serviceDate = input.serviceDate ?? new Date().toISOString().slice(0, 10)
  const log = await createServiceLog(db, {
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    serviceDate,
  }, input.technicianId)

  const token = mintToken()
  const expiresAt = new Date(Date.now() + SERVICE_LOG_UPLOAD_SESSION_TTL_MS)
  const [session] = await db.insert(serviceLogUploadSessions).values({
    tokenHash: hashToken(token),
    createdBy: input.createdBy,
    technicianId: input.technicianId,
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    invoiceId: input.invoiceId ?? null,
    serviceLogId: log.id,
    status: 'pending',
    expiresAt,
  }).returning()

  if (!session) throw new Error('FAILED_TO_CREATE_UPLOAD_SESSION')

  const ctx = await loadSessionContext(db, session)
  return {
    session,
    token,
    uploadUrl: publicUploadUrl(token),
    uploadPath: publicUploadPath(token),
    serviceLog: log,
    context: ctx,
  }
}

async function getLiveSessionByToken(db: Db, token: string) {
  const tokenHash = hashToken(token)
  const [session] = await db.select()
    .from(serviceLogUploadSessions)
    .where(eq(serviceLogUploadSessions.tokenHash, tokenHash))
    .limit(1)
  if (!session) throw new ServiceLogUploadServiceError('NOT_FOUND')
  if (session.status === 'cancelled') throw new ServiceLogUploadServiceError('CANCELLED')
  if (session.status === 'completed') return session
  if (session.expiresAt.getTime() < Date.now()) {
    await db.update(serviceLogUploadSessions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(serviceLogUploadSessions.id, session.id))
    throw new ServiceLogUploadServiceError('EXPIRED')
  }
  return session
}

export async function getPublicUploadSession(db: Db, token: string) {
  const session = await getLiveSessionByToken(db, token)
  const ctx = await loadSessionContext(db, session)
  const photoCount = session.serviceLogId
    ? await countServiceLogPhotos(db, session.serviceLogId)
    : 0

  return {
    id: session.id,
    status: session.status as ServiceLogUploadSessionStatus,
    expiresAt: session.expiresAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    serviceLogId: session.serviceLogId,
    invoiceId: session.invoiceId,
    photoCount,
    ...ctx,
  }
}

export async function getUploadSessionForStaff(db: Db, sessionId: string, actorId: string) {
  const [session] = await db.select()
    .from(serviceLogUploadSessions)
    .where(and(
      eq(serviceLogUploadSessions.id, sessionId),
      eq(serviceLogUploadSessions.createdBy, actorId),
    ))
    .limit(1)
  if (!session) throw new ServiceLogUploadServiceError('NOT_FOUND')

  if (session.status === 'pending' && session.expiresAt.getTime() < Date.now()) {
    await db.update(serviceLogUploadSessions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(serviceLogUploadSessions.id, session.id))
    session.status = 'expired'
  }

  const ctx = await loadSessionContext(db, session)
  const photoCount = session.serviceLogId
    ? await countServiceLogPhotos(db, session.serviceLogId)
    : 0

  return {
    id: session.id,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    serviceLogId: session.serviceLogId,
    invoiceId: session.invoiceId,
    technicianId: session.technicianId,
    photoCount,
    uploadUrl: null as string | null,
    ...ctx,
  }
}

async function countServiceLogPhotos(db: Db, serviceLogId: string): Promise<number> {
  const [row] = await db.select({ n: count() })
    .from(appFiles)
    .where(and(
      eq(appFiles.ownerEntityType, 'service_log'),
      eq(appFiles.ownerEntityId, serviceLogId),
    ))
  return Number(row?.n ?? 0)
}

export async function markUploadSessionUploading(db: Db, token: string) {
  const session = await getLiveSessionByToken(db, token)
  if (session.status === 'completed') throw new ServiceLogUploadServiceError('ALREADY_COMPLETED')
  if (session.status === 'pending') {
    const [updated] = await db.update(serviceLogUploadSessions)
      .set({ status: 'uploading', updatedAt: new Date() })
      .where(eq(serviceLogUploadSessions.id, session.id))
      .returning()
    return updated ?? session
  }
  return session
}

export async function completeUploadSessionByToken(db: Db, token: string) {
  const session = await getLiveSessionByToken(db, token)
  return completeUploadSession(db, session)
}

export async function completeUploadSessionById(db: Db, sessionId: string, actorId: string) {
  const [session] = await db.select()
    .from(serviceLogUploadSessions)
    .where(and(
      eq(serviceLogUploadSessions.id, sessionId),
      eq(serviceLogUploadSessions.createdBy, actorId),
    ))
    .limit(1)
  if (!session) throw new ServiceLogUploadServiceError('NOT_FOUND')
  if (session.status === 'cancelled') throw new ServiceLogUploadServiceError('CANCELLED')
  if (session.expiresAt.getTime() < Date.now() && session.status !== 'completed') {
    throw new ServiceLogUploadServiceError('EXPIRED')
  }
  return completeUploadSession(db, session)
}

async function completeUploadSession(
  db: Db,
  session: typeof serviceLogUploadSessions.$inferSelect,
) {
  if (session.status === 'completed') {
    const ctx = await loadSessionContext(db, session)
    return { session, context: ctx, alreadyCompleted: true as const }
  }

  if (!session.serviceLogId) throw new ServiceLogUploadServiceError('NOT_FOUND')
  const photoCount = await countServiceLogPhotos(db, session.serviceLogId)
  if (photoCount < 1) throw new ServiceLogUploadServiceError('NO_PHOTOS')

  const log = await getServiceLog(db, session.serviceLogId)
  if (log.status === 'draft' || log.status === 'uploaded') {
    await transitionServiceLog(db, log.id, 'ready_for_review')
  }

  if (session.invoiceId) {
    await db.update(invoices)
      .set({
        serviceLogId: session.serviceLogId,
        creationSource: 'service_log',
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, session.invoiceId))
  }

  const ctx = await loadSessionContext(db, session)
  const refreshedLog = await getServiceLog(db, session.serviceLogId)

  await postServiceLogUploadedForInvoiceTeamMessage(db, {
    senderUserId: session.technicianId,
    serviceLogId: refreshedLog.id,
    logNumber: refreshedLog.logNumber,
    customerId: session.customerId,
    customerName: ctx.customerName,
    vehicleId: session.vehicleId,
    vehicleLabel: ctx.vehicleLabel,
    invoiceId: session.invoiceId,
    invoiceNumber: ctx.invoiceNumber,
  }).catch(() => {})

  const [updated] = await db.update(serviceLogUploadSessions)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(serviceLogUploadSessions.id, session.id))
    .returning()

  return {
    session: updated ?? session,
    context: ctx,
    serviceLog: refreshedLog,
    alreadyCompleted: false as const,
  }
}

export async function cancelUploadSession(db: Db, sessionId: string, actorId: string) {
  const [session] = await db.select()
    .from(serviceLogUploadSessions)
    .where(and(
      eq(serviceLogUploadSessions.id, sessionId),
      eq(serviceLogUploadSessions.createdBy, actorId),
    ))
    .limit(1)
  if (!session) throw new ServiceLogUploadServiceError('NOT_FOUND')
  if (session.status === 'completed') throw new ServiceLogUploadServiceError('ALREADY_COMPLETED')

  const [updated] = await db.update(serviceLogUploadSessions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(serviceLogUploadSessions.id, session.id))
    .returning()
  return updated ?? session
}

export async function resolveSessionForFileUpload(db: Db, token: string) {
  const session = await markUploadSessionUploading(db, token)
  if (!session.serviceLogId) throw new ServiceLogUploadServiceError('NOT_FOUND')
  return {
    session,
    serviceLogId: session.serviceLogId,
    uploadedBy: session.technicianId,
  }
}
