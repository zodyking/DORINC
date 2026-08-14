import { describe, expect, it } from 'vitest'
import {
  isPasswordRequiredPath,
  isStaffGatePath,
  resolveGateStormFallback,
  resolveNextStaffPath,
  resolvePermissionDeniedPath,
  resolveStaffGateRedirect,
  resolveStaffLandingPath,
  shouldSkipPermissionCheck,
  withoutStaffGate,
} from '../../app/utils/staff-route-guard'

describe('resolveStaffLandingPath', () => {
  it('sends locked announcement users to the required message gate first', () => {
    expect(resolveStaffLandingPath({
      announcementGate: { locked: true },
      user: { mustChangePassword: true },
    })).toBe('/announcements/required')
  })

  it('prefers announcements, then password reset, then dashboard', () => {
    expect(resolveStaffLandingPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
    })).toBe('/account/password-required')

    expect(resolveStaffLandingPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: false },
    })).toBe('/dashboard')
  })

  it('recognizes gate paths', () => {
    expect(isPasswordRequiredPath('/account/password-required')).toBe(true)
    expect(isPasswordRequiredPath('/account')).toBe(false)
    expect(isStaffGatePath('/announcements/required')).toBe(true)
    expect(isStaffGatePath('/dashboard')).toBe(false)
  })
})

describe('resolveNextStaffPath (leave without remounting the same gate)', () => {
  it('skips a stale empty announcement lock instead of bouncing required ↔ required', () => {
    expect(resolveNextStaffPath({
      announcementGate: { locked: true, pendingCount: 0 },
      user: { mustChangePassword: false },
    }, { leaving: 'announcement', fromPath: '/announcements/required' })).toBe('/dashboard')
  })

  it('advances announcement → password after leaving', () => {
    expect(resolveNextStaffPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
    }, { leaving: 'announcement', fromPath: '/announcements/required' })).toBe('/account/password-required')
  })

  it('does not remount password-required when the flag is still set after save', () => {
    expect(resolveNextStaffPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
    }, { leaving: 'password', fromPath: '/account/password-required' })).toBe('/dashboard')
  })

  it('withoutStaffGate only clears the requested gate', () => {
    const auth = {
      announcementGate: { locked: true, pendingCount: 2, currentId: 'a1' },
      user: { mustChangePassword: true },
    }
    expect(withoutStaffGate(auth, 'announcement').announcementGate?.locked).toBe(false)
    expect(withoutStaffGate(auth, 'announcement').user?.mustChangePassword).toBe(true)
    expect(withoutStaffGate(auth, 'password').user?.mustChangePassword).toBe(false)
  })
})

describe('resolveStaffGateRedirect (dual-gate remade invites)', () => {
  const dual = {
    announcementGate: { locked: true, pendingCount: 2, currentId: 'a1' },
    user: { mustChangePassword: true },
  }

  it('keeps announcement-locked users on the required-message page even when a password reset is also due', () => {
    expect(resolveStaffGateRedirect('/announcements/required', dual)).toBeNull()
    expect(resolveStaffGateRedirect('/account/password-required', dual)).toBe('/announcements/required')
    expect(resolveStaffGateRedirect('/dashboard', dual)).toBe('/announcements/required')
    expect(resolveStaffGateRedirect('/account', dual)).toBe('/announcements/required')
  })

  it('sends password-only users to the password gate, not My Account', () => {
    const passwordOnly = {
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
    }
    expect(resolveStaffGateRedirect('/account/password-required', passwordOnly)).toBeNull()
    expect(resolveStaffGateRedirect('/dashboard', passwordOnly)).toBe('/account/password-required')
    expect(resolveStaffGateRedirect('/account', passwordOnly)).toBe('/account/password-required')
  })
})

describe('resolveGateStormFallback', () => {
  it('does not dump dual-gated users onto My Account', () => {
    const dual = {
      announcementGate: { locked: true, pendingCount: 3, currentId: 'a1' },
      user: { mustChangePassword: true },
    }
    expect(resolveGateStormFallback('/announcements/required', dual)).toBeNull()
    expect(resolveGateStormFallback('/account/password-required', dual)).toBe('/announcements/required')
    expect(resolveGateStormFallback('/account', dual)).toBe('/announcements/required')
    expect(resolveGateStormFallback('/dashboard', dual)).toBe('/announcements/required')
  })

  it('keeps a password-only storm on the password gate', () => {
    const passwordOnly = {
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
    }
    expect(resolveGateStormFallback('/account/password-required', passwordOnly)).toBeNull()
    expect(resolveGateStormFallback('/account', passwordOnly)).toBe('/account/password-required')
  })
})

describe('permission redirect loop guards', () => {
  it('does not bounce password-locked users off the password path', () => {
    const auth = {
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
    }
    expect(shouldSkipPermissionCheck('/account/password-required', auth)).toBe(true)
    expect(resolvePermissionDeniedPath('/account/password-required', auth)).toBeNull()
    expect(resolvePermissionDeniedPath('/dashboard', auth)).toBe('/account/password-required')
  })

  it('avoids dashboard→dashboard permission denial loops', () => {
    expect(resolvePermissionDeniedPath('/dashboard', {
      announcementGate: { locked: false },
    })).toBe('/account')
  })
})
