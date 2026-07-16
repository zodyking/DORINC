// Registry for best-effort saves before an auth session ends (idle timeout / expiry).

type SessionSaveHandler = () => void | Promise<void>

const HANDLER_TIMEOUT_MS = 15_000

const handlers = new Set<SessionSaveHandler>()

export function registerSessionSaveHandler(handler: SessionSaveHandler) {
  handlers.add(handler)
}

export function unregisterSessionSaveHandler(handler: SessionSaveHandler) {
  handlers.delete(handler)
}

async function runHandler(handler: SessionSaveHandler) {
  await Promise.race([
    Promise.resolve(handler()),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('session save handler timeout')), HANDLER_TIMEOUT_MS)
    }),
  ])
}

export async function runSessionSaveHandlers() {
  const pending = [...handlers]
  if (!pending.length) return

  await Promise.allSettled(pending.map(handler => runHandler(handler)))
}
