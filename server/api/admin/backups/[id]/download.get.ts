import { setHeaders } from 'h3'
import { useDb } from '../../../../db/client'
import {
  BackupsServiceError,
  getBackupDownload,
} from '../../../../services/backups.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

/** Download encrypted backup artifact for offline / local restore. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'backups.manage.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const file = await getBackupDownload(useDb(), id)

    await writeAudit(event, {
      entityType: 'backup',
      entityId: id,
      action: 'backup.download',
      afterData: {
        filename: file.filename,
        encryptedBytes: file.encryptedBytes,
        sha256Checksum: file.sha256Checksum,
      },
      permissionKey: 'backups.manage.all',
      riskLevel: 'sensitive',
    })

    const safeName = file.filename.replace(/["\\\r\n]/g, '_')
    setHeaders(event, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.encrypted.length),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Backup-Sha256': file.sha256Checksum,
    })
    return file.encrypted
  }
  catch (err) {
    if (err instanceof BackupsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Backup run not found or not completed')
    }
    throw err
  }
})
