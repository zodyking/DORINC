import { describe, expect, it } from 'vitest'
import {
  buildReferences,
  generateInternetMessageId,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../../server/workers/lib/email-thread.mjs'

describe('worker email-thread helpers', () => {
  it('normalizes wrapped addresses', () => {
    expect(normalizeEmailAddress('Shop <billing@example.com>')).toBe('billing@example.com')
  })

  it('builds reply subject once', () => {
    expect(subjectWithRePrefix('Hello')).toBe('Re: Hello')
    expect(subjectWithRePrefix('Re: Hello')).toBe('Re: Hello')
  })

  it('builds references chain', () => {
    expect(buildReferences('<a@x.com>', '<b@y.com>')).toBe('<a@x.com> <b@y.com>')
  })

  it('generates internet message ids', () => {
    expect(generateInternetMessageId('example.com')).toMatch(/^<.+@example\.com>$/)
  })
})
