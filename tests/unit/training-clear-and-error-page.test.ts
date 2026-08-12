import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('error page + training clear APIs', () => {
  it('ships a branded Nuxt error page', () => {
    const src = readFileSync(resolve('app/error.vue'), 'utf8')
    expect(src).toContain('Page not found')
    expect(src).toContain('clearError')
    expect(src).toContain('BRAND_NAME')
  })

  it('exposes clear-training and assignment lock patch endpoints', () => {
    const clearSrc = readFileSync(
      resolve('server/api/training/users/[userId]/clear.post.ts'),
      'utf8',
    )
    const patchSrc = readFileSync(
      resolve('server/api/training/assignments/[id].patch.ts'),
      'utf8',
    )
    expect(clearSrc).toContain('clearUserTrainingAssignments')
    expect(clearSrc).toContain('clearUserTrainingLocks')
    expect(patchSrc).toContain('setTrainingAssignmentLock')
  })

  it('training assign panel offers clear all / clear locks', () => {
    const src = readFileSync(
      resolve('app/components/training/TrainingAssignPanel.vue'),
      'utf8',
    )
    expect(src).toContain('Clear all training')
    expect(src).toContain('Clear locks')
    expect(src).toContain('mode: \'locks\'')
    expect(src).toContain('mode: \'all\'')
  })
})
