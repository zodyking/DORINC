import { describe, expect, it } from 'vitest'
import {
  isOpenRouterAuthErrorMessage,
  normalizeOpenRouterApiKey,
  openRouterAuthRecoveryMessage
} from '../../shared/openrouter-auth'

describe('openrouter-auth helpers', () => {
  it('normalizes Bearer prefixes and whitespace', () => {
    expect(normalizeOpenRouterApiKey('  Bearer sk-or-v1-abc  ')).toBe('sk-or-v1-abc')
    expect(normalizeOpenRouterApiKey('bearer   sk-or-v1-xyz')).toBe('sk-or-v1-xyz')
    expect(normalizeOpenRouterApiKey('sk-or-v1-plain')).toBe('sk-or-v1-plain')
    expect(normalizeOpenRouterApiKey('')).toBe('')
    expect(normalizeOpenRouterApiKey(null)).toBe('')
  })

  it('detects OpenRouter auth failures', () => {
    expect(isOpenRouterAuthErrorMessage('Missing Authentication header')).toBe(true)
    expect(isOpenRouterAuthErrorMessage('User not found.')).toBe(true)
    expect(isOpenRouterAuthErrorMessage('Unauthorized')).toBe(true)
    expect(isOpenRouterAuthErrorMessage('Rate limit exceeded')).toBe(false)
    expect(isOpenRouterAuthErrorMessage(null)).toBe(false)
  })

  it('returns a recovery message for operators', () => {
    expect(openRouterAuthRecoveryMessage()).toContain('Control Panel')
    expect(openRouterAuthRecoveryMessage()).toContain('OpenRouter')
  })
})
