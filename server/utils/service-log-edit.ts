import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import {
  getServiceLog,
  isServiceLogEditable,
  ServiceLogsServiceError,
} from '../services/service-logs.service'
import { apiError } from './api-error'
import { hasPermission, type AuthContext } from './require-permission'

export interface ServiceLogEditContext {
  log: Awaited<ReturnType<typeof getServiceLog>>
  isReviewer: boolean
  actorId: string
}

/** Ensures the actor may edit fields and files on this service log. */
export async function assertCanEditServiceLog(
  event: H3Event,
  db: Db,
  logId: string,
): Promise<ServiceLogEditContext> {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  let log
  try {
    log = await getServiceLog(db, logId)
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    throw err
  }

  const isReviewer = hasPermission(event, 'service_logs.review.all')
  const isOwner = log.submittedBy === auth.user.id
    && hasPermission(event, 'service_logs.upload.own', { ownsRecord: true })

  if (log.status === 'converted_to_invoice') {
    throw apiError(event, 'CONFLICT', 'Converted logs are read-only')
  }
  if (!isServiceLogEditable(log.status)) {
    throw apiError(event, 'CONFLICT', 'This service log can no longer be edited')
  }
  if (!isReviewer && !isOwner) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to edit this service log')
  }
  if (!hasPermission(event, 'files.upload.all')) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to upload files')
  }

  return { log, isReviewer, actorId: auth.user.id }
}
