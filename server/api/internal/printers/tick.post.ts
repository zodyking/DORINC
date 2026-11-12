import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { checkPrinterMail, releaseQueues, resolvePendingPrinterImages } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  const expected = (process.env.INTERNAL_WORKER_TOKEN || process.env.ENCRYPTION_MASTER_KEY || '').trim()
  const provided = String(getHeader(event, 'x-worker-token') || '').trim()
  if (!expected || !provided || provided !== expected) {
    throw apiError(event, 'FORBIDDEN', 'Invalid worker token')
  }
  const db = useDb()
  await releaseQueues(db)
  await checkPrinterMail(db)
  await resolvePendingPrinterImages(db, 1)
  return { ok: true }
})
