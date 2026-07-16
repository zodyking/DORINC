import { isProtectedAppPath, isUnauthorizedError } from '~/utils/auth-session'

function attachAuthFetchInterceptor(nuxtApp: { $fetch: typeof $fetch }) {
  const auth = useAuthStore()

  return nuxtApp.$fetch.create({
    onResponseError(ctx) {
      if (ctx.response.status !== 401) return
      if (auth.sessionExpiring) return
      if (!auth.isSignedIn) return
      void auth.handleSessionExpired()
    },
  })
}

export default defineNuxtPlugin({
  name: 'auth-fetch',
  enforce: 'pre',
  setup(nuxtApp) {
    const patched = attachAuthFetchInterceptor(nuxtApp)
    globalThis.$fetch = patched
    nuxtApp.provide('authFetch', patched)
  },
})
