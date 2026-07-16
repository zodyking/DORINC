export default defineNuxtPlugin(() => {
  const auth = useAuthStore()

  const patched = $fetch.create({
    onResponseError(ctx) {
      if (ctx.response.status !== 401) return
      if (auth.sessionExpiring) return
      if (!auth.isSignedIn) return
      void auth.handleSessionExpired()
    },
  })

  globalThis.$fetch = patched
})
