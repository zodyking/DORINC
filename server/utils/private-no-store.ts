import type { H3Event } from 'h3'

/** Prevent browsers and Nuxt from serving stale admin/user payloads. */
export function setPrivateNoStore(event: H3Event) {
  setHeader(event, 'Cache-Control', 'private, no-store, must-revalidate')
  setHeader(event, 'Pragma', 'no-cache')
}
