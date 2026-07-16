// Client idle session watchdog + global 401 handling for signed-in users.
export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore()
  const idle = useAuthSessionIdle()
  const route = useRoute()

  if (auth.isSignedIn) idle.start()

  watch(() => auth.isSignedIn, (signedIn) => {
    if (signedIn) idle.start()
    else idle.stop()
  })

  globalThis.$fetch = nuxtApp.$fetch.create({
    onResponseError({ response, request }) {
      const url = String(request)
      if (response.status !== 401) return
      if (!auth.isSignedIn || auth.sessionExpiring) return
      if (url.includes('/api/auth/login')) return
      if (url.includes('/api/auth/logout')) return
      if (route.path.startsWith('/auth/')) return
      void auth.handleSessionExpired()
    },
  })
})
