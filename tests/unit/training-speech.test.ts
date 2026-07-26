import { describe, expect, it } from 'vitest'
import { narrationSafeText, stripTrainingMarkdown, trainingStepNarration } from '../../shared/training-speech'
import { TRAINING_CATALOG } from '../../shared/training-catalog'

/** Anything a speech engine would read out as punctuation instead of a pause. */
const UNSPEAKABLE = /[→➔⇒⟶↓↑←—–·…“”„*_`#|]|->|=>/

describe('training speech', () => {
  it('builds narration from step fields', () => {
    const text = trainingStepNarration({
      type: 'content',
      title: 'Hello',
      body: 'Use **your voice** on step 5.',
      tips: ['Tap the menu icon'],
    })
    expect(text).toContain('Hello')
    expect(text).toContain('your voice')
    expect(text).not.toContain('**')
    expect(text).toContain('Tap the menu icon')
  })

  it('keeps symbols for display but never speaks them', () => {
    const copy = 'Field work → service log → invoice'
    // Display keeps the arrows.
    expect(stripTrainingMarkdown(copy)).toContain('→')
    // Narration turns them into pauses.
    expect(narrationSafeText(copy)).toBe('Field work, service log, invoice')
  })

  it('speaks separators, ampersands and slashes as words', () => {
    expect(narrationSafeText('Ready for review — waiting on you')).toBe('Ready for review, waiting on you')
    expect(narrationSafeText('Acme Fleet · Truck #HL-114')).toBe('Acme Fleet, Truck number HL-114')
    expect(narrationSafeText('Filter & sort')).toBe('Filter and sort')
    expect(narrationSafeText('Vehicle / unit')).toBe('Vehicle or unit')
    expect(narrationSafeText('Loading customers…')).toBe('Loading customers')
    expect(narrationSafeText('“Replaced DPF sensor”')).toBe('Replaced DPF sensor')
  })

  it('does not double up sentence stops', () => {
    const text = trainingStepNarration({
      type: 'content',
      title: 'Two records, one chain.',
      body: 'An invoice bills for it.',
    })
    expect(text).not.toMatch(/\.\./)
  })

  it('narrates pipeline stages and callouts', () => {
    const text = trainingStepNarration({
      type: 'flow',
      title: 'The pipeline',
      stages: [{ role: 'Mechanic', action: 'Uploads a log.', result: 'Status → Ready for review' }],
      callouts: [{ label: 'Service date', detail: 'The day the work happened — not today.' }],
    })
    expect(text).toContain('Mechanic')
    expect(text).toContain('Ready for review')
    expect(text).toContain('Service date')
    expect(text).not.toMatch(UNSPEAKABLE)
  })

  it('never narrates an unspeakable symbol anywhere in the catalog', () => {
    for (const mod of TRAINING_CATALOG) {
      for (const lesson of mod.lessons) {
        for (const step of lesson.steps) {
          const spoken = trainingStepNarration(step)
          expect(spoken, `${mod.slug}/${lesson.slug}/${step.type}`).not.toMatch(UNSPEAKABLE)
        }
      }
    }
  })
})
