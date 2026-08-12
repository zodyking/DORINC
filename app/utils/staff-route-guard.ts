import { isAnnouncementPath } from './announcements-ui'
import { isTrainingPath } from './training-ui'
import { consumeStaffReturnPath } from './staff-return-path'

export type StaffGateKind = 'announcement' | 'password' | 'training'

type AuthStoreLike = {
  announcementGate?: { locked?: boolean, pendingCount?: number, currentId?: string | null } | null
  trainingGate?: {
    locked?: boolean
    assignmentId?: string | null
    moduleId?: string | null
    moduleSlug?: string | null
    moduleTitle?: string | null
  } | null
  user?: { mustChangePassword?: boolean } | null
}

export function isPasswordRequiredPath(path: string): boolean {
  return path === '/account/password-required'
    || path.startsWith('/account/password-required/')
}

export function isStaffGatePath(path: string): boolean {
  return isAnnouncementPath(path) || isPasswordRequiredPath(path) || isTrainingPath(path)
}

export function trainingGateDestination(auth: AuthStoreLike): string {
  const slug = auth.trainingGate?.moduleSlug?.trim()
  return slug ? `/training/learn/${slug}` : '/training'
}

/** Clear one gate locally so exit navigation cannot immediately re-enter it. */
export function withoutStaffGate(auth: AuthStoreLike, gate: StaffGateKind): AuthStoreLike {
  if (gate === 'announcement') {
    return {
      ...auth,
      announcementGate: {
        locked: false,
        pendingCount: 0,
        currentId: null,
      },
    }
  }
  if (gate === 'password') {
    return {
      ...auth,
      user: {
        ...(auth.user ?? {}),
        mustChangePassword: false,
      },
    }
  }
  return {
    ...auth,
    trainingGate: {
      locked: false,
      assignmentId: null,
      moduleId: null,
      moduleSlug: null,
      moduleTitle: null,
    },
  }
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

  if (auth.user?.mustChangePassword) {
    if (isPasswordRequiredPath(toPath)) return null
    return '/account/password-required'
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

/**
 * Safe path after finishing/skipping a gate. Never returns the gate being left
 * when that would recreate the empty/locked bounce that hung login.
 */
export function resolveNextStaffPath(
  auth: AuthStoreLike,
  opts: { leaving?: StaffGateKind | null, fromPath?: string | null } = {},
): string {
  const fromPath = opts.fromPath ?? null
  let next = resolveStaffLandingPath(auth)

  if (opts.leaving === 'announcement' && next === '/announcements/required') {
    next = resolveStaffLandingPath(withoutStaffGate(auth, 'announcement'))
  }
  if (opts.leaving === 'password' && isPasswordRequiredPath(next)) {
    next = resolveStaffLandingPath(withoutStaffGate(auth, 'password'))
  }
  // Same learn URL still locked after exit → clear local lock so we do not remount it.
  // Do not clear when landing points at a *different* required module.
  if (opts.leaving === 'training' && fromPath && next === fromPath) {
    next = resolveStaffLandingPath(withoutStaffGate(auth, 'training'))
  }

  if (!next || (fromPath && next === fromPath)) {
    return '/dashboard'
  }
  return next
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
    const dest = trainingGateDestination(auth)
    if (dest === routePath) return undefined
    return navigateTo(dest)
  }

  return undefined
}
