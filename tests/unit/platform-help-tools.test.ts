import { afterEach, describe, expect, it, vi } from 'vitest'
import { openRouterChat } from '../../server/services/ai-openrouter.service'

describe('openRouterChat tool calling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends tools and parses tool_calls', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      expect(body.tools).toEqual(expect.any(Array))
      expect(body.tool_choice).toBe('auto')
      expect(body.response_format).toBeUndefined()
      return new Response(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{
              id: 'call_abc',
              type: 'function',
              function: {
                name: 'get_app_knowledge',
                arguments: '{"query":"invoices"}',
              },
            }],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.002 },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await openRouterChat(
      'sk-or-v1-abc',
      'test-model',
      [{ role: 'user', content: 'How do invoices work?' }],
      'platform_help',
      {
        responseFormat: 'text',
        tools: [{ type: 'function', function: { name: 'get_app_knowledge' } }],
        toolChoice: 'auto',
      },
    )

    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toMatchObject({
      id: 'call_abc',
      function: { name: 'get_app_knowledge', arguments: '{"query":"invoices"}' },
    })
    expect(result.finishReason).toBe('tool_calls')
  })
})
