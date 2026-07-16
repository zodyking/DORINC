export interface AuthApiErrorBody {
  message?: string
  data?: { message?: string }
  details?: Record<string, unknown>
}

export function authErrorMessage(err: unknown, fallback = 'Something went wrong — try again'): string {
  const fe = err as {
    data?: AuthApiErrorBody
    statusMessage?: string
    message?: string
  }
  return fe.data?.data?.message
    ?? fe.data?.message
    ?? fe.message
    ?? fe.statusMessage
    ?? fallback
}

export function authErrorReason(err: unknown): string | null {
  const fe = err as { data?: AuthApiErrorBody & { details?: Record<string, unknown> } }
  const reason = fe.data?.details?.reason ?? fe.data?.data?.details?.reason
  return typeof reason === 'string' ? reason : null
}

export function authErrorEmail(err: unknown): string | null {
  const fe = err as { data?: AuthApiErrorBody & { details?: Record<string, unknown> } }
  const email = fe.data?.details?.email ?? fe.data?.data?.details?.email
  return typeof email === 'string' ? email : null
}
