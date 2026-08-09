import { describe, expect, it } from 'vitest'
import { isPasswordRequiredPath, resolveStaffLandingPath } from '../../app/utils/staff-route-guard'

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
