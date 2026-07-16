import { isProtectedAppPath } from '~/utils/auth-session'

export function handleClientFetchAuthError(status: number, error?: unknown) {
  if (!import.meta.client) return false
  if (status !== 401) return false

  const auth = useAuthStore()
  const route = useRoute()
  if (!auth.isSignedIn || auth.sessionExpiring) return false
  if (!isProtectedAppPath(route.path)) return false

  void auth.handleSessionExpired()
  return true
}

export function handleUnauthorizedFetchError(error: unknown) {
  if (!import.meta.client) return false
  const status = (error as { statusCode?: number, response?: { status?: number } })?.statusCode
    ?? (error as { response?: { status?: number } })?.response?.status
  if (status !== 401) return false
  return handleClientFetchAuthError(401, error)
}
