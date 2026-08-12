import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Susan OpenRouter fallback copy', () => {
  it('does not dump OpenRouter internals into the chat bubble', () => {
    const src = readFileSync(resolve('server/services/platform-help.service.ts'), 'utf8')
    expect(src).toContain('susanTemporarilyUnavailableHtml')
    expect(src).not.toContain('could not reach OpenRouter just now')
    expect(src).not.toContain('Showing built-in help instead')
  })

  it('retries empty OpenRouter replies once', () => {
    const src = readFileSync(resolve('server/services/platform-help.service.ts'), 'utf8')
    expect(src).toContain("err.code === 'EMPTY_RESPONSE'")
    expect(src).toContain('retrying once')
  })
})
