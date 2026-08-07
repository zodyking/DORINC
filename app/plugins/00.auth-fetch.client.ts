import { DEVICE_ID_HEADER } from '#shared/device-id'
import { peekDeviceId } from '~/utils/device-id'

export default defineNuxtPlugin(() => {
  const auth = useAuthStore()

  const patched = $fetch.create({
    onRequest({ options }) {
      const id = peekDeviceId()
      if (!id) return
      const headers = new Headers(options.headers as HeadersInit | undefined)
      if (!headers.has(DEVICE_ID_HEADER)) {
        headers.set(DEVICE_ID_HEADER, id)
      }
      options.headers = headers
    },
    onResponseError(ctx) {
      if (ctx.response.status !== 401) return
      if (auth.sessionExpiring) return
      if (!auth.isSignedIn) return
      void auth.handleSessionExpired()
    },
  })

  globalThis.$fetch = patched
})
