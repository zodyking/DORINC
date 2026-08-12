import { describe, expect, it } from 'vitest'
import {
  isPasswordRequiredPath,
  isStaffGatePath,
  resolveNextStaffPath,
  resolvePermissionDeniedPath,
  resolveStaffLandingPath,
  shouldSkipPermissionCheck,
  trainingGateDestination,
  withoutStaffGate,
} from '../../app/utils/staff-route-guard'

describe('resolveStaffLandingPath', () => {
  it('sends locked announcement users to the required message gate first', () => {
    expect(resolveStaffLandingPath({
      announcementGate: { locked: true },
      trainingGate: { locked: true, moduleSlug: 'safety' },
      user: { mustChangePassword: true },
    })).toBe('/announcements/required')
  })

  it('prefers announcements, then password reset, then training, then dashboard', () => {
    expect(resolveStaffLandingPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
    })).toBe('/account/password-required')

    expect(resolveStaffLandingPath({
      announcementGate: { locked: false },
      trainingGate: { locked: true, moduleSlug: 'safety' },
      user: { mustChangePassword: false },
    })).toBe('/training/learn/safety')

    expect(resolveStaffLandingPath({
      announcementGate: { locked: false },
      trainingGate: { locked: false },
      user: { mustChangePassword: false },
    })).toBe('/dashboard')
  })

  it('recognizes gate paths', () => {
    expect(isPasswordRequiredPath('/account/password-required')).toBe(true)
    expect(isPasswordRequiredPath('/account')).toBe(false)
    expect(isStaffGatePath('/announcements/required')).toBe(true)
    expect(isStaffGatePath('/training/learn/safety')).toBe(true)
    expect(isStaffGatePath('/dashboard')).toBe(false)
  })
})

describe('resolveNextStaffPath (leave without remounting the same gate)', () => {
  it('skips a stale empty announcement lock instead of bouncing required ↔ required', () => {
    expect(resolveNextStaffPath({
      announcementGate: { locked: true, pendingCount: 0 },
      trainingGate: { locked: false },
      user: { mustChangePassword: false },
    }, { leaving: 'announcement', fromPath: '/announcements/required' })).toBe('/dashboard')
  })

  it('advances announcement → password → training in order after leaving', () => {
    expect(resolveNextStaffPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
      trainingGate: { locked: true, moduleSlug: 'safety' },
    }, { leaving: 'announcement', fromPath: '/announcements/required' })).toBe('/account/password-required')

    expect(resolveNextStaffPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: false },
      trainingGate: { locked: true, moduleSlug: 'safety' },
    }, { leaving: 'password', fromPath: '/account/password-required' })).toBe('/training/learn/safety')
  })

  it('does not remount password-required when the flag is still set after save', () => {
    expect(resolveNextStaffPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
      trainingGate: { locked: false },
    }, { leaving: 'password', fromPath: '/account/password-required' })).toBe('/dashboard')
  })

  it('clears a stale same-module training lock but keeps a different required module', () => {
    expect(resolveNextStaffPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: false },
      trainingGate: { locked: true, moduleSlug: 'safety' },
    }, { leaving: 'training', fromPath: '/training/learn/safety' })).toBe('/dashboard')

    expect(resolveNextStaffPath({
      announcementGate: { locked: false },
      user: { mustChangePassword: false },
      trainingGate: { locked: true, moduleSlug: 'invoice' },
    }, { leaving: 'training', fromPath: '/training/learn/safety' })).toBe('/training/learn/invoice')
  })

  it('withoutStaffGate only clears the requested gate', () => {
    const auth = {
      announcementGate: { locked: true, pendingCount: 2, currentId: 'a1' },
      trainingGate: { locked: true, moduleSlug: 'safety' },
      user: { mustChangePassword: true },
    }
    expect(withoutStaffGate(auth, 'announcement').announcementGate?.locked).toBe(false)
    expect(withoutStaffGate(auth, 'announcement').user?.mustChangePassword).toBe(true)
    expect(withoutStaffGate(auth, 'password').user?.mustChangePassword).toBe(false)
    expect(withoutStaffGate(auth, 'training').trainingGate?.locked).toBe(false)
  })
})

describe('training / permission redirect loop guards', () => {
  it('builds the training gate destination from slug', () => {
    expect(trainingGateDestination({
      trainingGate: { locked: true, moduleSlug: 'safety' },
    })).toBe('/training/learn/safety')
    expect(trainingGateDestination({
      trainingGate: { locked: true, moduleSlug: null },
    })).toBe('/training')
  })

  it('does not bounce training-locked users off the training path when permission is missing', () => {
    const auth = {
      announcementGate: { locked: false },
      trainingGate: { locked: true, moduleSlug: 'safety' },
    }
    expect(shouldSkipPermissionCheck('/training/learn/safety', auth)).toBe(true)
    expect(resolvePermissionDeniedPath('/training/learn/safety', auth)).toBeNull()
    expect(resolvePermissionDeniedPath('/dashboard', auth)).toBe('/training/learn/safety')
  })

  it('does not bounce password-locked users off the password path', () => {
    const auth = {
      announcementGate: { locked: false },
      user: { mustChangePassword: true },
      trainingGate: { locked: false },
    }
    expect(shouldSkipPermissionCheck('/account/password-required', auth)).toBe(true)
    expect(resolvePermissionDeniedPath('/account/password-required', auth)).toBeNull()
    expect(resolvePermissionDeniedPath('/dashboard', auth)).toBe('/account/password-required')
  })

  it('avoids dashboard→dashboard permission denial loops', () => {
    expect(resolvePermissionDeniedPath('/dashboard', {
      announcementGate: { locked: false },
      trainingGate: { locked: false },
    })).toBe('/account')
  })
})
