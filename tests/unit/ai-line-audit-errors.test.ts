import { describe, expect, it } from 'vitest'
import { OpenRouterServiceError } from '../../server/services/ai-openrouter.service'
import { AiProviderServiceError } from '../../server/services/ai-provider.service'
import { normalizeAiExecutionErrorForTest } from '../../server/services/ai-features.service'

describe('line audit AI error normalization', () => {
  it('maps missing OpenRouter auth to not configured', () => {
    const err = new OpenRouterServiceError('API_ERROR', 'Missing Authentication header')
    expect(normalizeAiExecutionErrorForTest(err).code).toBe('NOT_CONFIGURED')
  })

  it('maps missing provider key to not configured', () => {
    const err = new AiProviderServiceError('KEY_MISSING', 'Stored API key could not be decrypted')
    expect(normalizeAiExecutionErrorForTest(err).code).toBe('NOT_CONFIGURED')
  })

  it('maps other OpenRouter failures to AI_FAILED', () => {
    const err = new OpenRouterServiceError('API_ERROR', 'Rate limit exceeded')
    expect(normalizeAiExecutionErrorForTest(err).code).toBe('AI_FAILED')
  })
})
