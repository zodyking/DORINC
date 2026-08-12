import { isProtectedAppPath } from '~/utils/auth-session'
import { AUTH_ME_POLL_MS } from '#shared/auth-me-refresh'

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore()
  const route = useRoute()

  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function revalidateSession(opts: { soon?: boolean } = {}) {
    if (!auth.isSignedIn || auth.sessionExpiring || auth.loginHydrating) return
    if (typeof document !== 'undefined' && document.hidden) return

    const hadUser = !!auth.user
    const ok = opts.soon ? await auth.fetchMeSoon() : await auth.fetchMe({ force: true })
    // loginHydrating can end while this request was in flight — do not logout mid-login.
    if (auth.loginHydrating) return
    if (hadUser && !ok && !auth.user && isProtectedAppPath(route.path)) {
      await auth.forceLogout(true)
    }
  }

  function stopPoll() {
    if (!pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  function startPoll() {
    if (!import.meta.client || pollTimer || !auth.isSignedIn) return
    pollTimer = setInterval(() => {
      void revalidateSession({ soon: false })
    }, AUTH_ME_POLL_MS)
  }

  const onVisible = () => {
    if (document.hidden) {
      stopPoll()
      return
    }
    startPoll()
    void revalidateSession({ soon: true })
  }

  const onPageShow = (event: Event) => {
    const persisted = (event as PageTransitionEvent).persisted
    if (persisted) void revalidateSession({ soon: true })
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onVisible)

  watch(() => auth.isSignedIn, (signedIn) => {
    if (signedIn) {
      startPoll()
      void revalidateSession({ soon: true })
    }
    else {
      stopPoll()
    }
  })

  nuxtApp.hook('app:mounted', () => {
    if (auth.isSignedIn) {
      startPoll()
      void revalidateSession({ soon: true })
    }
  })
})
