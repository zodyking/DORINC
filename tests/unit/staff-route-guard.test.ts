import { describe, expect, it } from 'vitest'
import { resolveStaffLandingPath } from '../../app/utils/staff-route-guard'

describe('resolveStaffLandingPath', () => {
  it('sends locked announcement users to the required message gate', () => {
    expect(resolveStaffLandingPath({
      announcementGate: { locked: true },
      trainingGate: { locked: true, moduleSlug: 'safety' },
      user: { mustChangePassword: false },
    })).toBe('/announcements/required')
  })

  it('prefers password change, then announcements, then training, then dashboard', () => {
    expect(resolveStaffLandingPath({
      announcementGate: { locked: true },
      user: { mustChangePassword: true },
    })).toBe('/account?password=required')

    expect(resolveStaffLandingPath({
      announcementGate: { locked: false },
      trainingGate: { locked: true, moduleSlug: 'safety' },
    })).toBe('/training/learn/safety')

    expect(resolveStaffLandingPath({
      announcementGate: { locked: false },
      trainingGate: { locked: false },
    })).toBe('/dashboard')
  })
})
