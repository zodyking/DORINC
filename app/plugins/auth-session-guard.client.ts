import { isProtectedAppPath } from '~/utils/auth-session'

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore()
  const route = useRoute()

  async function revalidateSession() {
    if (!auth.isSignedIn) return
    const hadUser = !!auth.user
    await auth.fetchMe()
    if (hadUser && !auth.isSignedIn && isProtectedAppPath(route.path)) {
      await auth.forceLogout(true)
    }
  }

  const onVisible = () => {
    if (!document.hidden) void revalidateSession()
  }

  const onPageShow = (event: Event) => {
    const persisted = (event as PageTransitionEvent).persisted
    if (persisted) void revalidateSession()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onVisible)

  nuxtApp.hook('app:mounted', () => {
    void revalidateSession()
  })
})
