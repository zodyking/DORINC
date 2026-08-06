import { isAnnouncementPath } from './announcements-ui'
import { isTrainingPath } from './training-ui'

type AuthStoreLike = {
  announcementGate?: { locked?: boolean } | null
  trainingGate?: { locked?: boolean, moduleSlug?: string | null } | null
  user?: { mustChangePassword?: boolean } | null
}

/** Post-login / index landing for staff after /me is hydrated. */
export function resolveStaffLandingPath(auth: AuthStoreLike): string {
  if (auth.user?.mustChangePassword) return '/account?password=required'
  if (auth.announcementGate?.locked) return '/announcements/required'
  if (auth.trainingGate?.locked) {
    const slug = auth.trainingGate.moduleSlug
    return slug ? `/training/learn/${slug}` : '/training'
  }
  return '/dashboard'
}

/** Shared staff-route guard — used by global middleware and staff layout. */
export async function guardStaffRoute(path?: string): Promise<ReturnType<typeof navigateTo> | undefined> {
  const auth = useAuthStore()
  if (!auth.loaded) await auth.fetchMe()

  if (!auth.isSignedIn) {
    return navigateTo('/auth/login?card=staff')
  }

  if (auth.isCustomer) {
    return navigateTo('/portal')
  }

  const routePath = path ?? useRoute().path

  if (auth.user?.mustChangePassword) {
    if (routePath !== '/account') {
      return navigateTo('/account?password=required')
    }
    return undefined
  }

  // Mandatory login messages — before training lock and dashboard.
  if (auth.announcementGate?.locked && !isAnnouncementPath(routePath)) {
    return navigateTo('/announcements/required')
  }

  if (auth.trainingGate?.locked && !isTrainingPath(routePath) && !isAnnouncementPath(routePath)) {
    const slug = auth.trainingGate.moduleSlug
    return navigateTo(slug ? `/training/learn/${slug}` : '/training')
  }

  return undefined
}
