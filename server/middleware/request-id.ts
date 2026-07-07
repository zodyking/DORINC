import { randomUUID } from 'node:crypto'

/**
 * Assign a request id to every request (SPEC §14 error shape + §11 audit).
 * Honors an inbound x-request-id from a trusted proxy, echoes it back, and
 * logs one line per API request including the id.
 */
export default defineEventHandler((event) => {
  const inbound = getHeader(event, 'x-request-id')
  const requestId = inbound && /^[\w-]{8,64}$/.test(inbound) ? inbound : randomUUID()

  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)

  if (event.path.startsWith('/api/')) {
    console.log(`[req ${requestId}] ${event.method} ${event.path}`)  
  }
})
