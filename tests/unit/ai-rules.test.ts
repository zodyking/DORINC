import { describe, expect, it } from 'vitest'
import {
  createAiRuleCard,
  formatAiRulesForPrompt,
  parseAiRuleCards,
  serializeAiRuleCards,
} from '../../shared/ai-rules.mjs'

describe('ai rule cards', () => {
  it('parses JSON card arrays', () => {
    const cards = parseAiRuleCards(JSON.stringify([
      { id: 'a', title: 'One', rule: 'Do the thing' },
    ]))
    expect(cards).toHaveLength(1)
    expect(cards[0]?.title).toBe('One')
    expect(cards[0]?.rule).toBe('Do the thing')
  })

  it('parses legacy newline text into cards', () => {
    const cards = parseAiRuleCards('First rule\nSecond rule')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.rule).toBe('First rule')
    expect(cards[1]?.rule).toBe('Second rule')
  })

  it('serializes cleaned cards as pretty JSON', () => {
    const json = serializeAiRuleCards([
      createAiRuleCard({ id: 'x', title: 'T', rule: 'R' }),
      createAiRuleCard({ title: 'Empty', rule: '   ' }),
    ])
    const parsed = JSON.parse(json)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('x')
    expect(parsed[0].rule).toBe('R')
  })

  it('formats cards for prompts', () => {
    const text = formatAiRulesForPrompt(JSON.stringify([
      { title: 'Qty', rule: 'Match counts' },
    ]))
    expect(text).toContain('1. Qty: Match counts')
  })
})
