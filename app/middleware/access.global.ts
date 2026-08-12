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

export default defineNuxtRouteMiddleware(async (to) => {
  // Skip auth pages and tokenized public upload bridges
  if (to.path.startsWith('/auth/') || to.path === '/setup' || to.path.startsWith('/upload/')) return

  const auth = useAuthStore()

  // Ensure auth is loaded and re-validate cookie on client navigations.
  if (!auth.loaded) {
    await auth.fetchMe()
  }
  else if (import.meta.client && auth.isSignedIn) {
    await auth.fetchMe()
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

  // Required login message / training / password gates (staff-auth was never attached).
  const gateRedirect = await guardStaffRoute(to.path)
  if (gateRedirect) return gateRedirect

  // Check permission requirement from route meta
  const requiredPermission = to.meta.permission as string | string[] | undefined

  if (requiredPermission && !shouldSkipPermissionCheck(to.path, auth)) {
    const keys = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission]
    const hasAccess = keys.some(key => auth.can(key))

    if (!hasAccess) {
      const dest = resolvePermissionDeniedPath(to.path, auth)
      if (dest && dest !== to.path) return navigateTo(dest)
      // Already on a safe/gate path — do not redirect again (prevents login hangs).
      return
    }
  }
})
