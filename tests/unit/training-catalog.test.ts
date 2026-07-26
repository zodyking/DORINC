import { describe, expect, it } from 'vitest'
import { TRAINING_CATALOG, trainingCategoryLabel } from '../../shared/training-catalog'

describe('training catalog', () => {
  it('defines modules with lessons and steps', () => {
    expect(TRAINING_CATALOG.length).toBeGreaterThanOrEqual(6)
    for (const mod of TRAINING_CATALOG) {
      expect(mod.slug).toBeTruthy()
      expect(mod.lessons.length).toBeGreaterThan(0)
      expect(mod.lessons[0]?.steps.length).toBeGreaterThan(0)
    }
  })

  it('labels categories', () => {
    expect(trainingCategoryLabel('service_logs')).toContain('Service')
  })

  it('includes voice and photo service log modules', () => {
    const slugs = TRAINING_CATALOG.map(m => m.slug)
    expect(slugs).toContain('service-log-voice')
    expect(slugs).toContain('service-log-photos')
    expect(slugs).toContain('platform-navigation')
  })

  it('hands-on modules use practice steps with practiceId', () => {
    const handsOn = TRAINING_CATALOG.filter(m =>
      ['service-log-voice', 'service-log-photos', 'invoice-basics'].includes(m.slug),
    )
    for (const mod of handsOn) {
      const practiceSteps = mod.lessons.flatMap(l => l.steps).filter(s => s.type === 'practice')
      expect(practiceSteps.length).toBeGreaterThanOrEqual(6)
      for (const step of practiceSteps) {
        expect(step.practiceId).toBeTruthy()
      }
    }
  })
})
