import { useDb } from '../../../db/client'
import {
  getServiceLogSheetPayload,
  renderServiceLogSheetHtml,
} from '../../../services/service-log-sheet.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import type { AuthContext } from '../../../utils/require-permission'

/** Blank printable service log / service catalog sheet for mechanics. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const allowed = hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')

  if (!allowed) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to print the service log sheet')
  }

  const payload = await getServiceLogSheetPayload(useDb())
  const html = renderServiceLogSheetHtml(payload)

  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return html
})
