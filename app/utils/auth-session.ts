const PUBLIC_PATH_PREFIXES = ['/auth/', '/setup']
const PUBLIC_PATHS = new Set(['/', '/index'])

export function isPublicAppPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true
  return PUBLIC_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

export function isProtectedAppPath(path: string): boolean {
  return !isPublicAppPath(path)
}

export function loginPathForRoute(path: string): string {
  if (path.startsWith('/portal')) return '/auth/login'
  return '/auth/login?card=staff'
}

export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    statusCode?: number
    status?: number
    response?: { status?: number }
    data?: { code?: string }
  }
  if (err.statusCode === 401 || err.status === 401) return true
  if (err.response?.status === 401) return true
  if (err.data?.code === 'UNAUTHENTICATED') return true
  return false
}

export async function redirectToLogin(path: string) {
  const target = loginPathForRoute(path)
  if (import.meta.client) {
    window.location.replace(target)
    return
  }
  await navigateTo(target, { replace: true })
}
