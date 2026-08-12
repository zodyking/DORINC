export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()
  // Load once — do not re-hit /api/auth/me on every portal navigation.
  if (!auth.loaded) await auth.fetchMe()

  if (!auth.isSignedIn) {
    return navigateTo('/auth/login')
  }

  if (!auth.isCustomer) {
    return navigateTo('/dashboard')
  }
})
