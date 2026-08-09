import { useDb } from '../../../db/client'
import { findStaffUserForDevice } from '../../../services/service-log-sheet-upload.service'
import { ensureDeviceId } from '../../../utils/device-id'
import type { AuthContext } from '../../../utils/require-permission'
import { hasPermission } from '../../../utils/require-permission'
import { SERVICE_LOG_SHEET_UPLOAD_PATH } from '../../../../shared/service-log-sheet-upload'

/**
 * Bootstrap for the printed sheet QR landing page.
 * Returns signed-in staff identity, or a device-suggested staff user, or anonymous.
 */
export default defineEventHandler(async (event) => {
  const deviceId = ensureDeviceId(event)
  const auth = event.context.auth as (AuthContext & {
    user: { name: string, email: string }
  }) | undefined

  const user = auth?.user
  if (user && user.accountType !== 'customer') {
    const canUpload = hasPermission(event, 'service_logs.upload.own')
      || hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own')
    return {
      path: SERVICE_LOG_SHEET_UPLOAD_PATH,
      mode: 'signed_in' as const,
      canUpload,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      suggestedUser: null,
    }
  }

  const suggested = await findStaffUserForDevice(useDb(), deviceId)
  if (suggested) {
    return {
      path: SERVICE_LOG_SHEET_UPLOAD_PATH,
      mode: 'suggested' as const,
      canUpload: false,
      user: null,
      suggestedUser: {
        id: suggested.id,
        name: suggested.name,
        email: suggested.email,
      },
    }
  }

  return {
    path: SERVICE_LOG_SHEET_UPLOAD_PATH,
    mode: 'anonymous' as const,
    canUpload: false,
    user: null,
    suggestedUser: null,
  }
})
