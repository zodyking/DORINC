import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.read.all')
  setCookie(event, 'printers_tail_dismissed', '1', { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' })
  return { ok: true }
})
