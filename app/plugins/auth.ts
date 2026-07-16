// Load the signed-in user (and effective permissions) once per app start,
// so permission-gated UI renders correctly on any entry route.
import { isProtectedAppPath, redirectToLogin } from '~/utils/auth-session'

export default defineNuxtPlugin(async () => {
  const auth = useAuthStore()
  const route = useRoute()

  if (!auth.loaded) {
    await auth.fetchMe()
  }

  if (import.meta.client && !auth.isSignedIn && isProtectedAppPath(route.path)) {
    await redirectToLogin(route.path)
  }
})
