/**
 * Global route middleware for page-level access control.
 * Enforces permissions based on route meta, handles auth redirects.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // Skip auth pages
  if (to.path.startsWith('/auth/') || to.path === '/setup') return

  const auth = useAuthStore()

  // Ensure auth is loaded
  if (!auth.loaded) {
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

  // Check permission requirement from route meta
  const requiredPermission = to.meta.permission as string | string[] | undefined

  if (requiredPermission) {
    const keys = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission]
    const hasAccess = keys.some(key => auth.can(key))

    if (!hasAccess) {
      // Redirect to dashboard if user doesn't have permission
      return navigateTo('/dashboard')
    }
  }
})
