import { describe, expect, it } from 'vitest'
import { trainingStepNarration } from '../../shared/training-speech'

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
})
