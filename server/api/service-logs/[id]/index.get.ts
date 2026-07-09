import { and, desc, eq, isNull } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { appFiles } from '../../../db/schema/files'
import { getServiceLog, ServiceLogsServiceError } from '../../../services/service-logs.service'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import type { AuthContext } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const log = await getServiceLog(db, id)

    const allowed = hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
    if (!allowed) throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this service log')

    // File metadata only — binary served by /api/files/:id endpoints (SPEC §8)
    const files = await db.select({
      id: appFiles.id,
      fileKind: appFiles.fileKind,
      sourceFileId: appFiles.sourceFileId,
      originalFilename: appFiles.originalFilename,
      mimeType: appFiles.mimeType,
      fileSizeBytes: appFiles.fileSizeBytes,
      width: appFiles.width,
      height: appFiles.height,
      createdAt: appFiles.createdAt,
    })
      .from(appFiles)
      .where(and(
        eq(appFiles.ownerEntityType, 'service_log'),
        eq(appFiles.ownerEntityId, id),
        isNull(appFiles.archivedAt),
      ))
      .orderBy(desc(appFiles.createdAt))

    const history = await db.select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: auditLogs.actorName,
      changedFields: auditLogs.changedFields,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'service_log'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    return { log, files, history }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Service log not found')
    }
    throw err
  }
})
