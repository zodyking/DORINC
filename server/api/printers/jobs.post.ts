import { readMultipartFormData } from 'h3'
import { useDb } from '../../db/client'
import { requirePermission } from '../../utils/require-permission'
import { apiError } from '../../utils/api-error'
import { QUEUE_RE, isPrinterSides } from '../../../shared/printers'
import { PrintError, submitFile } from '../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.print.all')
  const parts = await readMultipartFormData(event) || []
  let file: { filename: string, data: Buffer } | null = null
  let queue = ''
  let sides = 'one-sided'
  let copies = 1
  for (const part of parts) {
    if ((part.name === 'file' || part.name === 'upload') && part.filename && part.data) {
      file = { filename: part.filename, data: part.data }
    }
    else if (part.name === 'queue' || part.name === 'printer') queue = part.data.toString('utf8').trim()
    else if (part.name === 'sides') sides = part.data.toString('utf8').trim()
    else if (part.name === 'copies') copies = Number(part.data.toString('utf8'))
  }
  if (!file) throw apiError(event, 'VALIDATION_ERROR', 'Choose a document')
  if (!QUEUE_RE.test(queue)) throw apiError(event, 'VALIDATION_ERROR', 'Choose a printer')
  if (!isPrinterSides(sides)) sides = 'one-sided'
  try {
    const id = await submitFile(useDb(), {
      filename: file.filename,
      data: file.data,
      queue,
      copies,
      sides,
      source: 'upload',
    })
    return { ok: true, id }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not queue the document')
  }
})
