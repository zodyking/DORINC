import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('branded error page', () => {
  it('ships a branded Nuxt error page', () => {
    const src = readFileSync(resolve('app/error.vue'), 'utf8')
    expect(src).toContain('Page not found')
    expect(src).toContain('clearError')
    expect(src).toContain('BRAND_NAME')
  })
})
