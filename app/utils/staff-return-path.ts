import { isServiceLogSheetUploadPath } from '#shared/service-log-sheet-upload'

const RETURN_KEY = 'dorinc_staff_return_to'
const AUTO_CONTINUE_KEY = 'dorinc_staff_return_auto'

/** Paths staff may return to after login / gate completion (phone QR flows). */
export function isAllowedStaffReturnPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false
  if (path.includes('://')) return false
  return isServiceLogSheetUploadPath(path)
}

export function setStaffReturnPath(path: string, opts: { autoContinue?: boolean } = {}) {
  if (!import.meta.client || !isAllowedStaffReturnPath(path)) return
  const clean = path.split('#')[0] || path
  sessionStorage.setItem(RETURN_KEY, clean)
  if (opts.autoContinue) sessionStorage.setItem(AUTO_CONTINUE_KEY, '1')
  else sessionStorage.removeItem(AUTO_CONTINUE_KEY)
}

export function peekStaffReturnPath(): string | null {
  if (!import.meta.client) return null
  const path = sessionStorage.getItem(RETURN_KEY)
  if (!path || !isAllowedStaffReturnPath(path)) {
    sessionStorage.removeItem(RETURN_KEY)
    return null
  }
  return path
}

/** Read and clear the post-login return path once gates are clear. */
export function consumeStaffReturnPath(): string | null {
  const path = peekStaffReturnPath()
  if (!import.meta.client) return path
  sessionStorage.removeItem(RETURN_KEY)
  return path
}

export function consumeStaffReturnAutoContinue(): boolean {
  if (!import.meta.client) return false
  const on = sessionStorage.getItem(AUTO_CONTINUE_KEY) === '1'
  sessionStorage.removeItem(AUTO_CONTINUE_KEY)
  return on
}
