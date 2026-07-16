// Client idle session watchdog.
export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const idle = useAuthSessionIdle()

  if (auth.isSignedIn) idle.start()

  watch(() => auth.isSignedIn, (signedIn) => {
    if (signedIn) idle.start()
    else idle.stop()
  })
})
