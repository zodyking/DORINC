import { describe, expect, it } from 'vitest'
import {
  isPasswordRequiredPath,
  resolvePermissionDeniedPath,
  resolveStaffLandingPath,
  shouldSkipPermissionCheck,
  trainingGateDestination,
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

  it('recognizes the forced password path', () => {
    expect(isPasswordRequiredPath('/account/password-required')).toBe(true)
    expect(isPasswordRequiredPath('/account')).toBe(false)
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

  it('avoids dashboard→dashboard permission denial loops', () => {
    expect(resolvePermissionDeniedPath('/dashboard', {
      announcementGate: { locked: false },
      trainingGate: { locked: false },
    })).toBe('/account')
  })
})
