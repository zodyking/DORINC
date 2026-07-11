export interface AuthApiErrorBody {
  message?: string
  details?: Record<string, unknown>
}

export function authErrorMessage(err: unknown, fallback = 'Something went wrong — try again'): string {
  const fe = err as { data?: AuthApiErrorBody }
  return fe.data?.message ?? fallback
}

export function authErrorReason(err: unknown): string | null {
  const reason = (err as { data?: AuthApiErrorBody }).data?.details?.reason
  return typeof reason === 'string' ? reason : null
}

export function authErrorEmail(err: unknown): string | null {
  const email = (err as { data?: AuthApiErrorBody }).data?.details?.email
  return typeof email === 'string' ? email : null
}
