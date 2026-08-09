import { and, desc, eq, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, sessions, users } from '../db/schema/auth'
import { AuthError, issueSessionForUser, type LoginResult } from '../auth/auth.service'
import type { AccountType } from '../../shared/permissions/keys'
import { getAppUrl } from './app-config.service'
import {
  SERVICE_LOG_SHEET_UPLOAD_PATH,
  serviceLogSheetUploadUrl,
} from '../../shared/service-log-sheet-upload'

export { SERVICE_LOG_SHEET_UPLOAD_PATH, serviceLogSheetUploadUrl }

export type SheetUploadConfirmError
  = | 'DEVICE_UNKNOWN'
    | 'USER_MISMATCH'
    | 'USER_DISABLED'
    | 'NOT_STAFF'

export class SheetUploadConfirmServiceError extends Error {
  constructor(public readonly code: SheetUploadConfirmError) {
    super(code)
  }
}

export async function buildServiceLogSheetUploadQrDataUrl(
  appUrl = getAppUrl(),
): Promise<{ url: string, dataUrl: string }> {
  const url = serviceLogSheetUploadUrl(appUrl)
  const QRCode = (await import('qrcode')).default
  const dataUrl = await QRCode.toDataURL(url, {
    width: 160,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111111', light: '#ffffff' },
  })
  return { url, dataUrl }
}

/** Last staff user who signed in on this device (for “Are you …?” confirm). */
export async function findStaffUserForDevice(
  db: Db,
  deviceId: string | null | undefined,
): Promise<{ id: string, name: string, email: string } | null> {
  const id = deviceId?.trim().toLowerCase()
  if (!id) return null

  const [row] = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(sessions.deviceId, id),
      eq(users.isActive, true),
      ne(accountTypes.key, 'customer'),
    ))
    .orderBy(desc(sessions.createdAt))
    .limit(1)

  return row ?? null
}

/**
 * Confirm “Are you …?” on a remembered device and mint a staff session
 * without a password — only when this device previously signed in as that user.
 */
export async function confirmSheetUploadDeviceUser(
  db: Db,
  input: {
    deviceId: string | null | undefined
    userId: string
    ipAddress?: string | null
    userAgent?: string | null
  },
): Promise<LoginResult> {
  const suggested = await findStaffUserForDevice(db, input.deviceId)
  if (!suggested) throw new SheetUploadConfirmServiceError('DEVICE_UNKNOWN')
  if (suggested.id !== input.userId) throw new SheetUploadConfirmServiceError('USER_MISMATCH')

  const [row] = await db.select({
    user: users,
    accountTypeKey: accountTypes.key,
  })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, input.userId))
    .limit(1)

  if (!row) throw new SheetUploadConfirmServiceError('USER_MISMATCH')
  if (row.accountTypeKey === 'customer') throw new SheetUploadConfirmServiceError('NOT_STAFF')
  if (!row.user.isActive || row.user.rejectedAt) throw new SheetUploadConfirmServiceError('USER_DISABLED')
  if (!row.user.emailVerifiedAt || !row.user.approvedAt) throw new AuthError('NOT_APPROVED')

  return issueSessionForUser(db, row.user, row.accountTypeKey as AccountType, {
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    deviceId: input.deviceId,
    rotateSessions: true,
    resetAnnouncementAcks: false,
  })
}
