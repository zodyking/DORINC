import { eq } from 'drizzle-orm'
import { readMultipartFormData } from 'h3'
import { useDb } from '../../db/client'
import { users } from '../../db/schema/auth'
import { requirePermission, type AuthContext } from '../../utils/require-permission'
import { apiError } from '../../utils/api-error'
import { QUEUE_RE, isPrinterSides } from '../../../shared/printers'
import { printApiError, submitPrint } from '../../services/printers'

/** Upload a document to a shop printer. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.print.all')
  const auth = event.context.auth as AuthContext
  const parts = await readMultipartFormData(event) || []
  let file: { filename: string, data: Buffer, type?: string } | null = null
  let queue = ''
  let sides = 'one-sided'
  let copies = 1
  for (const part of parts) {
    if ((part.name === 'file' || part.name === 'upload') && part.filename && part.data) {
      file = { filename: part.filename, data: part.data, type: part.type }
    }
    else if (part.name === 'queue' || part.name === 'printer') queue = part.data.toString('utf8').trim()
    else if (part.name === 'sides') sides = part.data.toString('utf8').trim()
    else if (part.name === 'copies') copies = Number(part.data.toString('utf8'))
  }
  if (!file) throw apiError(event, 'VALIDATION_ERROR', 'Choose a document')
  if (!QUEUE_RE.test(queue)) throw apiError(event, 'VALIDATION_ERROR', 'Choose a printer')
  if (!isPrinterSides(sides)) sides = 'one-sided'
  if (!Number.isInteger(copies) || copies < 1 || copies > 10) {
    throw apiError(event, 'VALIDATION_ERROR', 'Copies must be between 1 and 10')
  }
  const [actor] = await useDb().select({ name: users.name }).from(users).where(eq(users.id, auth.user.id)).limit(1)
  try {
    const id = await submitPrint({
      filename: file.filename,
      data: file.data,
      queue,
      copies,
      sides,
      source: 'upload',
      sender: actor?.name || '',
      contentType: file.type,
    })
    return { ok: true, id }
  }
  catch (err) {
    throw printApiError(event, err, 'Could not queue the document')
  }
})
