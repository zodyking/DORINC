import { defineNitroPlugin } from 'nitropack/runtime'

/**
 * A single unhandled rejection kills the Node process, which takes down every
 * signed-in session at once (and returns raw proxy 404s until the container
 * restarts). Log instead so one bad request cannot end everyone's session.
 */
export default defineNitroPlugin(() => {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    console.error('[process] unhandled rejection:', err.stack ?? err.message)
  })

  process.on('uncaughtException', (err) => {
    console.error('[process] uncaught exception:', err.stack ?? err.message)
  })
})
