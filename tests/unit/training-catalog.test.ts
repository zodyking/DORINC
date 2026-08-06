import { describe, expect, it } from 'vitest'
import {
  TRAINING_CATALOG,
  TRAINING_CATEGORIES,
  trainingCategoryLabel,
} from '../../shared/training-catalog'

/** Step types the lesson player knows how to render. */
const RENDERABLE = new Set([
  'welcome', 'complete', 'content', 'interactive', 'practice', 'flow', 'checklist', 'quiz',
])

describe('training catalog', () => {
  it('defines modules with lessons and steps', () => {
    expect(TRAINING_CATALOG.length).toBeGreaterThanOrEqual(6)
    for (const mod of TRAINING_CATALOG) {
      expect(mod.slug).toBeTruthy()
      expect(mod.title).toBeTruthy()
      expect(mod.description).toBeTruthy()
      expect(mod.estimatedMinutes).toBeGreaterThan(0)
      expect(mod.lessons.length).toBeGreaterThan(0)
      for (const lesson of mod.lessons) {
        expect(lesson.slug).toBeTruthy()
        expect(lesson.steps.length).toBeGreaterThan(0)
      }
    }
  })

  it('labels categories', () => {
    expect(trainingCategoryLabel('service_logs')).toContain('Service')
  })

  it('includes photo service log and navigation modules', () => {
    const slugs = TRAINING_CATALOG.map(m => m.slug)
    expect(slugs).toContain('service-log-photos')
    expect(slugs).not.toContain('service-log-voice')
    expect(slugs).toContain('platform-navigation')
  })

  it('uses unique module and lesson slugs', () => {
    const slugs = TRAINING_CATALOG.map(m => m.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const mod of TRAINING_CATALOG) {
      const lessonSlugs = mod.lessons.map(l => l.slug)
      expect(new Set(lessonSlugs).size).toBe(lessonSlugs.length)
    }
  })

  it('only uses step types the player can render', () => {
    for (const mod of TRAINING_CATALOG) {
      for (const lesson of mod.lessons) {
        for (const step of lesson.steps) {
          expect(RENDERABLE.has(step.type), `${mod.slug}/${lesson.slug}: ${step.type}`).toBe(true)
        }
      }
    }
  })

  it('keeps every category mapped to a label', () => {
    for (const mod of TRAINING_CATALOG) {
      expect(TRAINING_CATEGORIES[mod.category], mod.slug).toBeTruthy()
    }
  })

  it('gives quiz steps a question, options and a valid answer index', () => {
    for (const mod of TRAINING_CATALOG) {
      for (const lesson of mod.lessons) {
        for (const step of lesson.steps.filter(s => s.type === 'quiz')) {
          expect(step.question, mod.slug).toBeTruthy()
          expect(step.options?.length ?? 0).toBeGreaterThan(1)
          expect(step.correctIndex).toBeGreaterThanOrEqual(0)
          expect(step.correctIndex!).toBeLessThan(step.options!.length)
          expect(step.explanation, mod.slug).toBeTruthy()
        }
      }
    }
  })

  it('gives checklist steps items and interactive/practice steps a target', () => {
    for (const mod of TRAINING_CATALOG) {
      for (const lesson of mod.lessons) {
        for (const step of lesson.steps) {
          if (step.type === 'checklist') {
            expect(step.items?.length ?? 0, `${mod.slug}/${lesson.slug}`).toBeGreaterThan(0)
          }
          if (step.type === 'interactive') {
            expect(step.demo, `${mod.slug}/${lesson.slug}`).toBeTruthy()
          }
          if (step.type === 'practice') {
            expect(step.practiceId, `${mod.slug}/${lesson.slug}`).toBeTruthy()
          }
        }
      }
    }
  })

  it('routes every practice step to a panel that exists', () => {
    // TrainingPracticePanel dispatches on these prefixes.
    const PREFIXES = ['sl-', 'inv-', 'nav-', 'msg-']
    for (const mod of TRAINING_CATALOG) {
      for (const lesson of mod.lessons) {
        for (const step of lesson.steps.filter(s => s.type === 'practice')) {
          const id = step.practiceId ?? ''
          expect(
            PREFIXES.some(p => id.startsWith(p)),
            `${mod.slug}/${lesson.slug}: unroutable practiceId "${id}"`,
          ).toBe(true)
        }
      }
    }
  })

  it('teaches team messages and customer email hands-on', () => {
    const dm = TRAINING_CATALOG.find(m => m.slug === 'staff-messages')
    const email = TRAINING_CATALOG.find(m => m.slug === 'customer-email')
    expect(dm).toBeTruthy()
    expect(email).toBeTruthy()

    // Both must be practice-driven, not just prose.
    const practiceIds = (mod: typeof dm) => (mod?.lessons ?? [])
      .flatMap(l => l.steps)
      .filter(s => s.type === 'practice')
      .map(s => s.practiceId)

    expect(practiceIds(dm).length).toBeGreaterThanOrEqual(2)
    expect(practiceIds(email).length).toBeGreaterThanOrEqual(4)

    // The email course must cover reading, replying and sending.
    const ids = practiceIds(email)
    expect(ids).toContain('msg-open-thread')
    expect(ids).toContain('msg-reply')
    expect(ids).toContain('msg-pick-customer')
    expect(ids).toContain('msg-send')

    // Team course must teach referencing the record.
    expect(practiceIds(dm)).toContain('msg-attach-record')
  })

  it('ships a workflow course covering the full staff hand-off chain', () => {
    const workflow = TRAINING_CATALOG.find(m => m.slug === 'workflow')
    expect(workflow).toBeTruthy()
    expect(workflow!.lessons.length).toBeGreaterThanOrEqual(3)

    const flow = workflow!.lessons
      .flatMap(l => l.steps)
      .find(s => s.type === 'flow')
    expect(flow?.stages?.length ?? 0).toBeGreaterThanOrEqual(5)

    const roles = (flow!.stages ?? []).map(s => s.role)
    expect(roles).toContain('Mechanic')
    expect(roles).toContain('Accountant')
    expect(roles).toContain('Customer')

    // Every stage must say who acts and what the system produces.
    for (const stage of flow!.stages ?? []) {
      expect(stage.role).toBeTruthy()
      expect(stage.action).toBeTruthy()
      expect(stage.result).toBeTruthy()
    }
  })
})
