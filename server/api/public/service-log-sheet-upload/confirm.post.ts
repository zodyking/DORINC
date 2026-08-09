import { getHeader } from 'h3'
import { z } from 'zod'
import { AuthError } from '../../../auth/auth.service'
import { setSessionCookie } from '../../../auth/session-cookie'
import { useDb } from '../../../db/client'
import {
  confirmSheetUploadDeviceUser,
  SheetUploadConfirmServiceError,
} from '../../../services/service-log-sheet-upload.service'
import { getClientIp } from '../../../utils/client-ip'
import { ensureDeviceId } from '../../../utils/device-id'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../../utils/require-rate-limit'
import { validateBody } from '../../../utils/validate'
import { uuidSchema } from '../../../../shared/validators/common'

const bodySchema = z.object({
  userId: uuidSchema,
})

/**
 * “Yes — continue” on the printed-sheet upload landing.
 * Issues a staff session when this device previously signed in as the confirmed user.
 */
export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, bodySchema)
  const deviceId = ensureDeviceId(event)
  const db = useDb()

  try {
    const result = await confirmSheetUploadDeviceUser(db, {
      deviceId,
      userId: body.userId,
      ipAddress: getClientIp(event),
      userAgent: getHeader(event, 'user-agent'),
    })

    setSessionCookie(event, result.sessionToken)

    return {
      ok: true as const,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
    }
  }
  catch (err) {
    if (err instanceof SheetUploadConfirmServiceError) {
      if (err.code === 'DEVICE_UNKNOWN' || err.code === 'USER_MISMATCH') {
        throw apiError(event, 'UNAUTHENTICATED', 'Sign in to continue uploading on this phone')
      }
      if (err.code === 'USER_DISABLED' || err.code === 'NOT_STAFF') {
        throw apiError(event, 'FORBIDDEN', 'This account cannot upload service logs')
      }
    }
    if (err instanceof AuthError) {
      throw apiError(event, 'FORBIDDEN', 'This account cannot upload service logs yet')
    }
    throw err
  }
})
