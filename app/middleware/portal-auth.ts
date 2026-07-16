export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()
  if (!auth.loaded) await auth.fetchMe()
  else if (import.meta.client && auth.isSignedIn) await auth.fetchMe()

  if (!auth.isSignedIn) {
    return navigateTo('/auth/login')
  }

  if (!auth.isCustomer) {
    return navigateTo('/dashboard')
  }
})
