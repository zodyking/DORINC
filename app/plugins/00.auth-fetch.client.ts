import { DEVICE_ID_HEADER } from '#shared/device-id'
import { OUTSIDE_GEO_SESSION_HEADER } from '#shared/outside-geo-session'
import { peekDeviceId } from '~/utils/device-id'
import { hasOutsideGeoTabSession } from '~/utils/outside-geo-session'

export default defineNuxtPlugin(() => {
  const auth = useAuthStore()

  const patched = $fetch.create({
    onRequest({ options }) {
      const headers = new Headers(options.headers as HeadersInit | undefined)
      const id = peekDeviceId()
      if (id && !headers.has(DEVICE_ID_HEADER)) {
        headers.set(DEVICE_ID_HEADER, id)
      }
      if (hasOutsideGeoTabSession() && !headers.has(OUTSIDE_GEO_SESSION_HEADER)) {
        headers.set(OUTSIDE_GEO_SESSION_HEADER, '1')
      }
      options.headers = headers
    },
    onResponseError(ctx) {
      // Access gate can block API calls after SPA navigation leaves the fence.
      if (ctx.response.status === 403) {
        const body = ctx.response._data as {
          details?: { reason?: string, redirectTo?: string }
          data?: { details?: { reason?: string, redirectTo?: string } }
        } | undefined
        const details = body?.details ?? body?.data?.details
        if (details?.reason === 'access_blocked') {
          const redirectTo = typeof details.redirectTo === 'string' && details.redirectTo.startsWith('/')
            ? details.redirectTo
            : '/auth/access-restricted'
          void navigateTo(redirectTo)
          return
        }
      }
      if (ctx.response.status !== 401) return
      if (auth.sessionExpiring) return
      if (!auth.isSignedIn) return
      void auth.handleSessionExpired()
    },
  })

  globalThis.$fetch = patched
})
