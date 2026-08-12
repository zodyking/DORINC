import { isAnnouncementPath } from './announcements-ui'
import { isTrainingPath } from './training-ui'
import { consumeStaffReturnPath } from './staff-return-path'

type AuthStoreLike = {
  announcementGate?: { locked?: boolean } | null
  trainingGate?: { locked?: boolean, moduleSlug?: string | null } | null
  user?: { mustChangePassword?: boolean } | null
}

export function isPasswordRequiredPath(path: string): boolean {
  return path === '/account/password-required'
    || path.startsWith('/account/password-required/')
}

export function trainingGateDestination(auth: AuthStoreLike): string {
  const slug = auth.trainingGate?.moduleSlug
  return slug ? `/training/learn/${slug}` : '/training'
}

/**
 * Permission-denied redirect. Returns null to allow the current route through
 * (used when a gate already forced the user onto a path they must be able to open).
 */
export function resolvePermissionDeniedPath(
  toPath: string,
  auth: AuthStoreLike,
): string | null {
  if (auth.announcementGate?.locked && !isAnnouncementPath(toPath)) {
    return '/announcements/required'
  }

  // Training lock + missing training.complete.own used to bounce
  // /training/learn/* ↔ /dashboard forever (login hang + /api/auth/me storm).
  if (auth.trainingGate?.locked) {
    if (isTrainingPath(toPath)) return null
    return trainingGateDestination(auth)
  }

  if (toPath === '/dashboard' || toPath.startsWith('/dashboard/')) {
    return '/account'
  }
  return '/dashboard'
}

/** Skip route-meta permission checks while a force-gate owns the destination. */
export function shouldSkipPermissionCheck(toPath: string, auth: AuthStoreLike): boolean {
  if (auth.announcementGate?.locked && isAnnouncementPath(toPath)) return true
  if (auth.user?.mustChangePassword && isPasswordRequiredPath(toPath)) return true
  if (auth.trainingGate?.locked && isTrainingPath(toPath)) return true
  return false
}

/** Post-login / index landing for staff after /me is hydrated. */
export function resolveStaffLandingPath(auth: AuthStoreLike): string {
  // Login messages → password reset → training → optional return path → dashboard
  if (auth.announcementGate?.locked) return '/announcements/required'
  if (auth.user?.mustChangePassword) return '/account/password-required'
  if (auth.trainingGate?.locked) {
    return trainingGateDestination(auth)
  }
  return consumeStaffReturnPath() ?? '/dashboard'
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

  // Mandatory login messages first.
  if (auth.announcementGate?.locked && !isAnnouncementPath(routePath)) {
    return navigateTo('/announcements/required')
  }

  // Then forced password reset — no dashboard / training until done.
  if (auth.user?.mustChangePassword) {
    if (!isPasswordRequiredPath(routePath)) {
      return navigateTo('/account/password-required')
    }
    return undefined
  }

  if (
    auth.trainingGate?.locked
    && !isTrainingPath(routePath)
    && !isAnnouncementPath(routePath)
    && !isPasswordRequiredPath(routePath)
  ) {
    return navigateTo(trainingGateDestination(auth))
  }

  return undefined
}
