import { describe, expect, it } from 'vitest'
import { isTrainingLearnPath, isTrainingPath } from '../../app/utils/training-ui'
import { staffPostLoginPath } from '../../app/utils/staff-post-login-path'

describe('training-ui paths', () => {
  it('treats the hub separately from active lessons for lock checks', () => {
    expect(isTrainingPath('/training')).toBe(true)
    expect(isTrainingLearnPath('/training')).toBe(false)
    expect(isTrainingLearnPath('/training/learn/team-messages')).toBe(true)
  })
})

describe('staffPostLoginPath', () => {
  it('opens the first locked course instead of the dashboard', () => {
    expect(staffPostLoginPath({
      locked: true,
      assignmentId: 'a1',
      moduleId: 'm1',
      moduleSlug: 'team-messages',
      moduleTitle: 'Team messages',
    })).toBe('/training/learn/team-messages')
  })

  it('falls back to the dashboard when training is not locked', () => {
    expect(staffPostLoginPath({
      locked: false,
      assignmentId: null,
      moduleId: null,
      moduleSlug: null,
      moduleTitle: null,
    })).toBe('/dashboard')
  })
})
