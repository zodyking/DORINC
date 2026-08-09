import { and, desc, eq, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, sessions, users } from '../db/schema/auth'
import { getAppUrl } from './app-config.service'
import {
  SERVICE_LOG_SHEET_UPLOAD_PATH,
  serviceLogSheetUploadUrl,
} from '../../shared/service-log-sheet-upload'

export { SERVICE_LOG_SHEET_UPLOAD_PATH, serviceLogSheetUploadUrl }

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
