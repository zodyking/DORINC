import { describe, expect, it } from 'vitest'
import { platformHelpAskSchema } from '../../shared/validators/ai'

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('platformHelpAskSchema', () => {
  it('normalizes a single legacy imageDataUrl into imageDataUrls', () => {
    const parsed = platformHelpAskSchema.parse({
      question: 'What is this?',
      imageDataUrl: tinyPng,
    })
    expect(parsed.imageDataUrls).toEqual([tinyPng])
  })

  it('accepts multiple imageDataUrls', () => {
    const parsed = platformHelpAskSchema.parse({
      question: 'Compare these',
      imageDataUrls: [tinyPng, tinyPng],
    })
    expect(parsed.imageDataUrls).toHaveLength(2)
  })
})
