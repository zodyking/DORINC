import { and, eq, isNull } from 'drizzle-orm'
import { setHeaders } from 'h3'
import { z } from 'zod'
import { useDb } from '../../../db/client'
import { appFiles } from '../../../db/schema/files'
import { getServiceLog, ServiceLogsServiceError } from '../../../services/service-logs.service'
import { FilesServiceError, getFileWithData } from '../../../services/files.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { uuidSchema } from '../../../../shared/validators/common'
import type { AuthContext } from '../../../utils/require-permission'

const paramsSchema = z.object({
  id: uuidSchema,
  fileId: uuidSchema,
})

/** Preview a file that belongs to a service log — gated by service log read access. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id: logId, fileId } = validateParams(event, paramsSchema)
  const db = useDb()

  try {
    const log = await getServiceLog(db, logId)
    const allowed = hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
    if (!allowed) throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this service log')

    const [owned] = await db.select({ id: appFiles.id })
      .from(appFiles)
      .where(and(
        eq(appFiles.id, fileId),
        eq(appFiles.ownerEntityType, 'service_log'),
        eq(appFiles.ownerEntityId, logId),
        isNull(appFiles.archivedAt),
      ))
      .limit(1)
    if (!owned) throw apiError(event, 'NOT_FOUND', 'File not found on this service log')

    const file = await getFileWithData(db, fileId)

    setHeaders(event, {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.fileSizeBytes),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    })
    return file.binaryData
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    if (err instanceof FilesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'File not found')
    }
    throw err
  }
})
