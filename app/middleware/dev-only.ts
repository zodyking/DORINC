/** Block dev-only preview routes in production builds. */
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.dev) return
  return navigateTo('/')
})
