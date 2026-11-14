import { hasPermission } from '../../utils/require-permission'
import { printTargets } from '../../services/printers'

/** Printers a signed-in user can send app documents to (empty without print access). */
export default defineEventHandler(async (event) => {
  if (!hasPermission(event, 'printers.print.all')) return { printers: [] }
  return { printers: await printTargets() }
})
