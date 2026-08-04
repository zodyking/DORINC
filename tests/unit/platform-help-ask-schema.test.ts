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

  it('sanitizes history content and drops empty rows', () => {
    const parsed = platformHelpAskSchema.parse({
      question: 'Follow up',
      history: [
        { role: 'user', content: '  hi  ' },
        { role: 'assistant', content: `${'x'.repeat(5000)}` },
        { role: 'user', content: '   ' },
      ],
    })
    expect(parsed.history).toHaveLength(2)
    expect(parsed.history?.[0]?.content).toBe('hi')
    expect(parsed.history?.[1]?.content.length).toBe(4000)
  })

  it('drops blank pageContext strings', () => {
    const parsed = platformHelpAskSchema.parse({
      question: 'Help',
      pageContext: '   ',
    })
    expect(parsed.pageContext).toBeUndefined()
  })
})
