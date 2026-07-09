// Load the signed-in user (and effective permissions) once per app start,
// so permission-gated UI renders correctly on any entry route.
export default defineNuxtPlugin(async () => {
  const auth = useAuthStore()
  if (!auth.loaded) {
    await auth.fetchMe()
  }
})
