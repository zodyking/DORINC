import { isTrainingLearnPath } from './training-ui'

/** Shared staff-route guard — used by middleware and staff layout. */
export async function guardStaffRoute(): Promise<void> {
  const auth = useAuthStore()
  if (!auth.loaded) {
    await auth.fetchMe()
  }
  else if (import.meta.client && auth.isSignedIn) {
    await auth.fetchMe()
  }

  if (!auth.isSignedIn) {
    return navigateTo('/auth/login?card=staff')
  }

  if (auth.isCustomer) {
    return navigateTo('/portal')
  }

  const route = useRoute()

  if (auth.user?.mustChangePassword) {
    if (route.path !== '/account') {
      return navigateTo('/account?password=required')
    }
    return
  }

  if (auth.trainingGate?.locked && !isTrainingLearnPath(route.path)) {
    const slug = auth.trainingGate.moduleSlug
    if (slug) return navigateTo(`/training/learn/${slug}`)
  }
}
