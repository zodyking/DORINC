/**
 * Global route middleware for page-level access control.
 * Enforces permissions based on route meta, handles auth redirects,
 * and blocks the workspace until required login messages are acknowledged.
 */
import {
  guardStaffRoute,
  resolvePermissionDeniedPath,
  shouldSkipPermissionCheck,
} from '~/utils/staff-route-guard'
import {
  clearMiddlewareRedirectLog,
  noteMiddlewareRedirect,
} from '~/utils/middleware-redirect-guard'

export default defineNuxtRouteMiddleware(async (to) => {
  // Skip auth pages and tokenized public upload bridges
  if (to.path.startsWith('/auth/') || to.path === '/setup' || to.path.startsWith('/upload/')) return

  const auth = useAuthStore()

  // Load auth once per app start. Ongoing freshness: client polls /api/auth/me
  // every 5s (and sooner on focus/visibility), not on every click/navigation.
  if (!auth.loaded) {
    await auth.fetchMe({ force: true })
  }

  // Portal routes - handled by portal-auth middleware
  if (to.path.startsWith('/portal')) return

  // Public/auth routes that don't need access control
  if (to.path === '/' || to.path === '/index') return

  // Staff routes - require auth
  if (!auth.isSignedIn) {
    return navigateTo('/auth/login?card=staff')
  }

  // Redirect customers to portal
  if (auth.isCustomer) {
    return navigateTo('/portal')
  }

  // Required login message / password gates (staff-auth was never attached).
  const gateRedirect = await guardStaffRoute(to.path)
  if (gateRedirect) {
    if (noteMiddlewareRedirect(to.path)) {
      clearMiddlewareRedirectLog()
      // Break gate ping-pong so Sign in can finish.
      if (auth.announcementGate) {
        auth.announcementGate = { ...auth.announcementGate, locked: false, pendingCount: 0, currentId: null }
      }
      if (auth.user?.mustChangePassword) {
        auth.user = { ...auth.user, mustChangePassword: false }
      }
      if (to.path !== '/account') return navigateTo('/account')
      return
    }
    return gateRedirect
  }

  // Check permission requirement from route meta
  const requiredPermission = to.meta.permission as string | string[] | undefined

  if (requiredPermission && !shouldSkipPermissionCheck(to.path, auth)) {
    const keys = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission]
    const hasAccess = keys.some(key => auth.can(key))

    if (!hasAccess) {
      const dest = resolvePermissionDeniedPath(to.path, auth)
      if (dest && dest !== to.path) {
        if (noteMiddlewareRedirect(to.path)) {
          clearMiddlewareRedirectLog()
          if (to.path !== '/account') return navigateTo('/account')
          return
        }
        return navigateTo(dest)
      }
      // Already on a safe/gate path — do not redirect again (prevents login hangs).
      return
    }
  }

  clearMiddlewareRedirectLog()
})
