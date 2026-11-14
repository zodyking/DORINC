import { useDb } from '../../db/client'
import { hasPermission } from '../../utils/require-permission'
import { listPrinterRows } from '../../services/printers/store'

/** Printers a signed-in user can send app documents to (empty without print access). */
export default defineEventHandler(async (event) => {
  if (!hasPermission(event, 'printers.print.all')) return { printers: [] }
  const rows = await listPrinterRows(useDb())
  return { printers: rows.map(row => ({ queue: row.queue, label: row.label })) }
})
