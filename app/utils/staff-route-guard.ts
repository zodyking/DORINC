import { isAnnouncementPath } from './announcements-ui'
import { consumeStaffReturnPath } from './staff-return-path'
import { isGateCooldownActive } from './staff-gate-cooldown'

export type StaffGateKind = 'announcement' | 'password'

type AuthStoreLike = {
  announcementGate?: { locked?: boolean, pendingCount?: number, currentId?: string | null } | null
  user?: { mustChangePassword?: boolean } | null
}

export function isPasswordRequiredPath(path: string): boolean {
  return path === '/account/password-required'
    || path.startsWith('/account/password-required/')
}

export function isStaffGatePath(path: string): boolean {
  return isAnnouncementPath(path) || isPasswordRequiredPath(path)
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
  return {
    ...auth,
    user: {
      ...(auth.user ?? {}),
      mustChangePassword: false,
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

  if (toPath === '/dashboard' || toPath.startsWith('/dashboard/')) {
    return '/account'
  }
  return '/dashboard'
}

/** Skip route-meta permission checks while a force-gate owns the destination. */
export function shouldSkipPermissionCheck(toPath: string, auth: AuthStoreLike): boolean {
  if (auth.announcementGate?.locked && isAnnouncementPath(toPath)) return true
  if (auth.user?.mustChangePassword && isPasswordRequiredPath(toPath)) return true
  return false
}

/** Post-login / index landing for staff after /me is hydrated. */
export function resolveStaffLandingPath(auth: AuthStoreLike): string {
  // Login messages → password reset → optional return path → dashboard
  if (auth.announcementGate?.locked) return '/announcements/required'
  if (auth.user?.mustChangePassword) return '/account/password-required'
  return consumeStaffReturnPath() ?? '/dashboard'
}

/**
 * Safe path after finishing/skipping a gate. Never returns the gate being left
 * when that would recreate a remount loop.
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

  // A detected redirect loop suppresses forced gates for a short window so the
  // app stays usable instead of ping-ponging every navigation into the gate.
  if (isGateCooldownActive()) return undefined

  // Mandatory login messages first.
  if (auth.announcementGate?.locked && !isAnnouncementPath(routePath)) {
    return navigateTo('/announcements/required')
  }

  // Then forced password reset — no dashboard until done.
  if (auth.user?.mustChangePassword) {
    if (!isPasswordRequiredPath(routePath)) {
      return navigateTo('/account/password-required')
    }
    return undefined
  }

  return undefined
}
