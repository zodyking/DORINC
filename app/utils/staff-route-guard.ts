import { isAnnouncementPath } from './announcements-ui'
import { isTrainingPath } from './training-ui'

/** Shared staff-route guard — used by middleware and staff layout. */
export async function guardStaffRoute(): Promise<void> {
  const auth = useAuthStore()
  if (!auth.loaded) await auth.fetchMe()

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

  // Mandatory login messages — before training lock and dashboard.
  if (auth.announcementGate?.locked && !isAnnouncementPath(route.path)) {
    return navigateTo('/announcements/required')
  }

  if (auth.trainingGate?.locked && !isTrainingPath(route.path) && !isAnnouncementPath(route.path)) {
    const slug = auth.trainingGate.moduleSlug
    return navigateTo(slug ? `/training/learn/${slug}` : '/training')
  }
}
