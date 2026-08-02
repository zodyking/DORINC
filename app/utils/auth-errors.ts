export interface AuthApiErrorBody {
  message?: string
  data?: { message?: string }
  details?: Record<string, unknown>
}

interface ValidationIssue {
  path?: string
  message?: string
}

function validationIssues(err: unknown): ValidationIssue[] {
  const fe = err as {
    data?: AuthApiErrorBody & { details?: { issues?: ValidationIssue[] } }
  }
  const issues = fe.data?.details?.issues ?? (fe.data?.data as { details?: { issues?: ValidationIssue[] } } | undefined)?.details?.issues
  return Array.isArray(issues) ? issues : []
}

function friendlyValidationMessage(issue: ValidationIssue): string {
  const path = issue.path ?? ''
  const message = issue.message ?? 'Invalid value'

  if (path === 'password' && /at least 12/i.test(message)) {
    return 'Password must be at least 12 characters'
  }
  if (path === 'email') return 'Enter a valid email address'
  if (path === 'firstName' || path === 'lastName') return `Enter your ${path === 'firstName' ? 'first' : 'last'} name`
  if (path === 'accountType') return 'Choose a valid role'

  return path ? `${path}: ${message}` : message
}

export function authErrorMessage(err: unknown, fallback = 'Something went wrong — try again'): string {
  const issues = validationIssues(err)
  if (issues.length) {
    return issues.map(friendlyValidationMessage).join(' ')
  }

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
