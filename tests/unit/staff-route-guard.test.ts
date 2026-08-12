import { describe, expect, it } from 'vitest'
import {
  isPasswordRequiredPath,
  isStaffGatePath,
  resolveNextStaffPath,
  resolvePermissionDeniedPath,
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
