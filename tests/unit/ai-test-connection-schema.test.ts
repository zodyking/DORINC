import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const testSchema = z.object({
  apiKey: z.string().trim().min(8).max(512).optional(),
}).default({})

describe('AI test-connection schema', () => {
  it('accepts missing body and uses stored key path', () => {
    expect(testSchema.parse(undefined)).toEqual({})
    expect(testSchema.parse({})).toEqual({})
  })

  it('accepts optional override api key', () => {
    expect(testSchema.parse({ apiKey: 'sk-or-test-key-12345' })).toEqual({
      apiKey: 'sk-or-test-key-12345',
    })
  })
})
