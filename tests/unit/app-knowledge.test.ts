import { describe, expect, it } from 'vitest'
import {
  APP_KNOWLEDGE_DOCS,
  formatAppKnowledgeForTool,
  listAppKnowledgeAreas,
  searchAppKnowledge,
} from '../../shared/app-knowledge'
import { parseGetAppKnowledgeArgs, SUSAN_HELP_TOOLS } from '../../shared/ai-tools'
import { executeSusanHelpTool } from '../../server/services/ai-tools.service'

describe('app knowledge corpus', () => {
  it('documents core product areas', () => {
    const areas = listAppKnowledgeAreas().map(a => a.area)
    expect(areas).toEqual(expect.arrayContaining([
      'navigation',
      'invoices',
      'service-logs',
      'customers',
      'admin',
    ]))
    expect(APP_KNOWLEDGE_DOCS.length).toBeGreaterThanOrEqual(12)
  })

  it('ranks invoice wizard docs for create-invoice queries', () => {
    const hits = searchAppKnowledge({ query: 'how do I create an invoice', limit: 3 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some(h => h.area === 'invoices')).toBe(true)
    expect(hits[0]!.score).toBeGreaterThan(0)
  })

  it('supports area-only lookup', () => {
    const hits = searchAppKnowledge({ area: 'service-logs', limit: 4 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(h => h.area === 'service-logs')).toBe(true)
  })

  it('formats summary vs full detail', () => {
    const hits = searchAppKnowledge({ query: 'control panel', limit: 1 })
    const summary = formatAppKnowledgeForTool(hits, 'summary')
    const full = formatAppKnowledgeForTool(hits, 'full')
    expect(summary).toContain('Summary:')
    expect(full.length).toBeGreaterThan(summary.length)
    expect(full).toContain('Page:')
  })
})

describe('get_app_knowledge tool', () => {
  it('registers an OpenAI-compatible tool definition', () => {
    expect(SUSAN_HELP_TOOLS[0]?.function.name).toBe('get_app_knowledge')
    expect(SUSAN_HELP_TOOLS[0]?.type).toBe('function')
  })

  it('parses args with default detail=full', () => {
    expect(parseGetAppKnowledgeArgs({ query: 'invoices' })).toEqual({
      query: 'invoices',
      area: undefined,
      detail: 'full',
    })
    expect(parseGetAppKnowledgeArgs({ detail: 'summary' }).detail).toBe('summary')
  })

  it('executes and returns knowledge content', async () => {
    const result = await executeSusanHelpTool({
      id: 'call_1',
      name: 'get_app_knowledge',
      arguments: JSON.stringify({ query: 'service log QR upload', detail: 'full' }),
    })
    expect(result.ok).toBe(true)
    expect(result.content.toLowerCase()).toMatch(/service log|qr|upload/)
  })

  it('lists areas when called without query', async () => {
    const result = await executeSusanHelpTool({
      id: 'call_2',
      name: 'get_app_knowledge',
      arguments: '{}',
    })
    expect(result.ok).toBe(true)
    expect(result.content).toContain('Available knowledge areas')
    expect(result.content).toContain('invoices')
  })

  it('rejects unknown tools', async () => {
    const result = await executeSusanHelpTool({
      id: 'call_3',
      name: 'delete_invoice',
      arguments: '{}',
    })
    expect(result.ok).toBe(false)
    expect(result.content).toContain('Unknown tool')
  })
})
